/**
 * Room store — the server-side source of truth for a world.
 *
 * Backed by SQLite through node's built-in driver, so there is no native
 * dependency and no service to run locally. All SQL lives in this module: the
 * move to Postgres in the hosting phase should be a swap here, not a change at
 * every call site.
 *
 * Rows keep real columns for the things the server will need to reason about
 * later (room, seat, status, who asked, when) and a JSON `data` column for the
 * full client object. That gets the world onto the server without freezing the
 * client's model while it is still moving.
 */

import { DatabaseSync, type StatementSync } from "node:sqlite";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { createLogger } from "../logger";
import { ACTIVITY_LIMIT, type ActivityEntry } from "../activity";
import { normaliseEmail, type Account, type AccountProfile, type SignedIn } from "../accounts";
import { personIdForEmail } from "./person-id";

const log = createLogger("RoomStore");

/** Single-player still means one room; multiplayer gives it a real slug. */
export const DEFAULT_ROOM = process.env.ROOM_SLUG ?? "local";

/** Placeholder until players have identities of their own. */
export const LOCAL_PLAYER = "local";

const DB_PATH = process.env.ROOM_DB_PATH ?? join(process.cwd(), ".data", "watercooler.sqlite");

/**
 * What a single room may spend on agents before it stops dispatching. This is a
 * hard stop rather than a warning: with an open room and a host-side API key,
 * the bill is the host's, and a runaway loop should end by itself.
 */
export const ROOM_SPEND_LIMIT_USD = Number(process.env.ROOM_SPEND_LIMIT_USD ?? 50);

/** How many strokes one board keeps before the oldest are dropped. */
const BOARD_STROKE_LIMIT = 2000;

/** How many names the cauldron remembers. */
export const PINBALL_HIGH_SCORES = 3;

export interface PinballScore {
  player: string;
  score: number;
  scored_at: string;
}

/** Mirrors the client-side caps so the server cannot grow without bound. */
export const LIMITS = {
  tasks: 200,
  messages: 400,
  sessions: 40,
} as const;

export interface RoomSnapshot {
  tasks: unknown[];
  messages: unknown[];
  sessions: unknown[];
  seats: unknown[];
  activeSessionKey: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms (
  slug               TEXT PRIMARY KEY,
  created_at         TEXT NOT NULL,
  active_session_key TEXT,
  spend_usd          REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS players (
  id           TEXT NOT NULL,
  room         TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sprite_key   TEXT,
  last_seen    TEXT NOT NULL,
  PRIMARY KEY (room, id)
);

CREATE TABLE IF NOT EXISTS seats (
  room       TEXT NOT NULL,
  seat_id    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data       TEXT NOT NULL,
  PRIMARY KEY (room, seat_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  room              TEXT NOT NULL,
  task_id           TEXT NOT NULL,
  seat_id           TEXT,
  session_key       TEXT,
  status            TEXT,
  requested_by      TEXT,
  requested_by_name TEXT,
  created_at        TEXT NOT NULL,
  position          INTEGER NOT NULL,
  data              TEXT NOT NULL,
  PRIMARY KEY (room, task_id)
);

CREATE TABLE IF NOT EXISTS messages (
  room        TEXT NOT NULL,
  message_id  TEXT NOT NULL,
  session_key TEXT,
  author_type TEXT NOT NULL,
  author      TEXT,
  created_at  TEXT NOT NULL,
  position    INTEGER NOT NULL,
  data        TEXT NOT NULL,
  PRIMARY KEY (room, message_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  room        TEXT NOT NULL,
  session_key TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  position    INTEGER NOT NULL,
  data        TEXT NOT NULL,
  PRIMARY KEY (room, session_key)
);

CREATE TABLE IF NOT EXISTS achievements (
  room         TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  code         TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  earned_at    TEXT NOT NULL,
  PRIMARY KEY (room, subject_type, subject_id, code)
);

CREATE TABLE IF NOT EXISTS board_strokes (
  room       TEXT NOT NULL,
  stroke_id  TEXT NOT NULL,
  position   INTEGER NOT NULL,
  data       TEXT NOT NULL,
  PRIMARY KEY (room, stroke_id)
);

CREATE TABLE IF NOT EXISTS activity (
  room      TEXT NOT NULL,
  position  INTEGER NOT NULL,
  at        TEXT NOT NULL,
  kind      TEXT NOT NULL,
  actor     TEXT NOT NULL,
  text      TEXT NOT NULL,
  detail    TEXT,
  PRIMARY KEY (room, position)
);

CREATE INDEX IF NOT EXISTS activity_by_room ON activity (room, position);

CREATE TABLE IF NOT EXISTS pinball_scores (
  room       TEXT NOT NULL,
  player     TEXT NOT NULL,
  score      INTEGER NOT NULL,
  scored_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pinball_by_room ON pinball_scores (room, score DESC);

CREATE TABLE IF NOT EXISTS arcade_scores (
  room       TEXT NOT NULL,
  game       TEXT NOT NULL,
  player     TEXT NOT NULL,
  score      INTEGER NOT NULL,
  scored_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS arcade_by_game ON arcade_scores (room, game, score DESC);
CREATE INDEX IF NOT EXISTS strokes_by_room ON board_strokes (room, position);
CREATE INDEX IF NOT EXISTS tasks_by_room ON tasks (room, position);
CREATE INDEX IF NOT EXISTS messages_by_room ON messages (room, position);
CREATE INDEX IF NOT EXISTS sessions_by_room ON sessions (room, position);

CREATE TABLE IF NOT EXISTS people (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  home       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS people_home ON people (home, updated_at);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  email          TEXT PRIMARY KEY,
  display_name   TEXT,
  image          TEXT,
  name           TEXT,
  home           TEXT,
  character_key  TEXT,
  character_path TEXT,
  visits         INTEGER NOT NULL DEFAULT 0,
  stats          TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  last_seen_at   TEXT NOT NULL
);
`;

/** The columns a table actually has, for a migration that must not assume. */
function columnNames(db: DatabaseSync, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

/**
 * Add a column only where it is missing.
 *
 * The checked form of what used to be `try { ALTER } catch {}`. That could
 * not tell "the column is already there", which is the ordinary case, from a
 * typo, a locked file or a disk that is full — every one of them came back
 * as the same silence, and a database that failed to migrate went on being
 * written to.
 */
function addColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  if (columnNames(db, table).has(column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  log.info(`added ${table}.${column}`);
}

interface Migration {
  /** What it does, for the log and for reading the ladder. */
  name: string;
  up(db: DatabaseSync): void;
}

/**
 * Every change to the shape of the database, in order.
 *
 * The index is the version a migration brings the database *to*:
 * `MIGRATIONS[0]` takes it from 0 to 1. `PRAGMA user_version` records how
 * far it has climbed, so each one runs exactly once and there is a place to
 * put a change that is not simply another column — a rename, a backfill, an
 * index that has to be rebuilt. There was nowhere for one of those before,
 * because nothing recorded what shape a database was in.
 *
 * A migration may be run against a database that already has what it is
 * adding: everything before the ladder existed sits at version 0 with the
 * tables and, depending on its age, some of the columns. So the baseline
 * asks before it adds. From version 2 on, the version is the answer and a
 * migration can assume the one before it ran.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    name: "baseline",
    up: (db) => {
      db.exec(SCHEMA);
      // Two columns that arrived before the ladder did, so a database made
      // by an older build has the tables without them.
      addColumn(db, "rooms", "spend_usd", "REAL NOT NULL DEFAULT 0");
      addColumn(db, "tasks", "requested_by_name", "TEXT");
    },
  },
];

/** The shape this build expects. */
export const SCHEMA_VERSION = MIGRATIONS.length;

interface DataRow {
  data: string;
}

interface AccountRow {
  email: string;
  display_name: string | null;
  image: string | null;
  name: string | null;
  home: string | null;
  character_key: string | null;
  character_path: string | null;
  visits: number;
  stats: string;
}

function parseRows(rows: DataRow[]): unknown[] {
  const out: unknown[] = [];
  for (const row of rows) {
    try {
      out.push(JSON.parse(row.data));
    } catch {
      // A single corrupt row should not take the whole room down
      log.warn("skipping unparseable row");
    }
  }
  return out;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export class RoomStore {
  private db: DatabaseSync;

  /**
   * Compiled statements, kept by their SQL.
   *
   * `prepare` parses and plans the statement every time it is called, and
   * every method here called it afresh — including `ensureRoom`, which runs
   * ahead of nearly every other one, and `appendMessage`, which runs on every
   * line anybody says. The SQL is a fixed set of literals (the handful built
   * from a table name among them, since the tables are a closed list), so it
   * compiles once and is reused for the life of the process, which is what a
   * prepared statement is for.
   */
  private statements = new Map<string, StatementSync>();

  private stmt(sql: string): StatementSync {
    let compiled = this.statements.get(sql);
    if (!compiled) this.statements.set(sql, (compiled = this.db.prepare(sql)));
    return compiled;
  }

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    try {
      this.db.exec("PRAGMA journal_mode = WAL");
      this.db.exec("PRAGMA foreign_keys = ON");
      this.migrate();
    } catch (err) {
      // An open handle on a database this build has refused to touch is
      // worth nothing and holds the file, so let it go before saying why.
      this.db.close();
      throw err;
    }
    log.info(`opened ${path} at schema ${SCHEMA_VERSION}`);
  }

  /**
   * Let the file go.
   *
   * The server never calls this — the store is one handle for the life of
   * the process — but a test that opens a database on disk cannot delete it
   * afterwards while something still holds it, which on Windows is an error
   * rather than a nicety.
   */
  close() {
    // The compiled statements hold the file too, so they go first.
    this.statements.clear();
    this.db.close();
  }

  private get version(): number {
    // Straight to the driver: this is read twice per open, before the cache
    // is worth anything, and migration should not depend on it at all.
    const row = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    return row.user_version;
  }

  /**
   * Walk the database up to the shape this build expects.
   *
   * Each migration runs in its own transaction with the version stamped
   * inside it, so a database is either at the version before or the version
   * after and never halfway between. A migration that throws takes the
   * server down with it, which is the point: the alternative is going on to
   * write rows into a shape that was never finished.
   */
  private migrate() {
    const from = this.version;

    if (from > SCHEMA_VERSION) {
      // Rolling a build back is a fair thing to do in an emergency, but this
      // one cannot say whether the newer shape is one it can still write to,
      // and guessing wrong corrupts a room quietly. So it refuses and says
      // what it found: roll forward, or restore the database from before.
      throw new Error(
        `This database is at schema ${from} and this build only knows ${SCHEMA_VERSION}. ` +
          `Run a newer build, or restore a backup taken at ${SCHEMA_VERSION} or below.`,
      );
    }

    for (let version = from; version < SCHEMA_VERSION; version += 1) {
      const migration = MIGRATIONS[version];
      this.db.exec("BEGIN");
      try {
        migration.up(this.db);
        // Not a parameter: PRAGMA takes none. The value is an array index.
        this.db.exec(`PRAGMA user_version = ${version + 1}`);
        this.db.exec("COMMIT");
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw new Error(
          `Migration ${version + 1} (${migration.name}) failed: ${(err as Error).message}`,
        );
      }
      log.info(`migrated to schema ${version + 1}: ${migration.name}`);
    }
  }

  // ── People ────────────────────────────────────────────

  /**
   * Remember who calls a building home. A person is a browser profile, not
   * an account; this is what puts a desk with their name on it on their
   * building's floor for everyone else to see.
   */
  upsertPerson(person: { id: string; name: string; home: string }) {
    this.stmt(
      `INSERT INTO people (id, name, home, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, home = excluded.home, updated_at = excluded.updated_at`,
    ).run(person.id, person.name.slice(0, 16), person.home, new Date().toISOString());
  }

  /** Everyone who calls a building home, earliest first — desks are handed out in this order. */
  listPeople(home: string): { id: string; name: string }[] {
    return this.stmt("SELECT id, name FROM people WHERE home = ? ORDER BY rowid ASC").all(
      home,
    ) as unknown as { id: string; name: string }[];
  }

  // ── Settings ──────────────────────────────────────────

  /** A server-wide setting chosen from the HUD, kept across restarts. */
  getSetting(key: string): string | null {
    const row = this.stmt("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string) {
    this.stmt(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, value, new Date().toISOString());
  }

  // ── Accounts ──────────────────────────────────────────

  /**
   * Someone signed in has arrived. Counts the visit, remembers what the
   * provider says they are called and look like, and hands back the account
   * as the browser wants it — with the profile they chose here, if they have.
   */
  visitAccount(person: SignedIn): Account {
    const email = normaliseEmail(person.email);
    const now = new Date().toISOString();
    this.stmt(
      `INSERT INTO accounts (email, display_name, image, visits, created_at, updated_at, last_seen_at)
         VALUES (?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           display_name = excluded.display_name,
           image = excluded.image,
           visits = visits + 1,
           last_seen_at = excluded.last_seen_at`,
    ).run(email, person.name, person.image, now, now, now);
    return this.getAccount(email)!;
  }

  /** Keep the profile someone chose; their desk follows their home. */
  saveAccountProfile(person: SignedIn, profile: AccountProfile): Account {
    const email = normaliseEmail(person.email);
    const now = new Date().toISOString();
    this.stmt(
      `INSERT INTO accounts (email, display_name, image, name, home, character_key, character_path, created_at, updated_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           name = excluded.name,
           home = excluded.home,
           character_key = excluded.character_key,
           character_path = excluded.character_path,
           updated_at = excluded.updated_at`,
    ).run(
      email,
      person.name,
      person.image,
      profile.name,
      profile.home,
      profile.character.key,
      profile.character.path,
      now,
      now,
      now,
    );
    this.upsertPerson({ id: personIdForEmail(email), name: profile.name, home: profile.home });
    return this.getAccount(email)!;
  }

  /** Count something about a person: a game played, a score, a task handed out. */
  bumpAccountStat(email: string, stat: string, by = 1): Account | null {
    const account = this.getAccount(normaliseEmail(email));
    if (!account) return null;
    const stats = { ...account.stats, [stat]: (account.stats[stat] ?? 0) + by };
    this.stmt("UPDATE accounts SET stats = ?, updated_at = ? WHERE email = ?").run(
      JSON.stringify(stats),
      new Date().toISOString(),
      account.email,
    );
    return { ...account, stats };
  }

  getAccount(email: string): Account | null {
    const row = this.stmt(
      `SELECT email, display_name, image, name, home, character_key, character_path, visits, stats
         FROM accounts WHERE email = ?`,
    ).get(normaliseEmail(email)) as AccountRow | undefined;
    if (!row) return null;
    const complete = row.name && row.home && row.character_key && row.character_path;
    let stats: Record<string, number> = {};
    try {
      stats = JSON.parse(row.stats) as Record<string, number>;
    } catch {
      // A damaged blob counts for nothing; the next bump starts it afresh.
    }
    return {
      email: row.email,
      displayName: row.display_name,
      image: row.image,
      personId: personIdForEmail(row.email),
      profile: complete
        ? {
            name: row.name!,
            home: row.home!,
            character: { key: row.character_key!, path: row.character_path! },
          }
        : null,
      visits: row.visits,
      stats,
    };
  }

  // ── Whiteboard ────────────────────────────────────────

  /**
   * Add or update a stroke. Updates matter: a stroke is streamed while it is
   * being drawn, so the same id arrives repeatedly with more points, and a
   * refresh mid-drawing should show what has been drawn so far.
   */
  addStroke(room: string, strokeId: string, data: unknown) {
    this.ensureRoom(room);
    const row = this.stmt("SELECT MAX(position) AS edge FROM board_strokes WHERE room = ?").get(
      room,
    ) as { edge: number | null };

    this.stmt(
      `INSERT INTO board_strokes (room, stroke_id, position, data) VALUES (?, ?, ?, ?)
         ON CONFLICT (room, stroke_id) DO UPDATE SET data = excluded.data`,
    ).run(room, strokeId, (row?.edge ?? 0) + 1, JSON.stringify(data));

    this.trimStrokes(room);
  }

  listStrokes(room: string): unknown[] {
    this.ensureRoom(room);
    return parseRows(
      this.stmt("SELECT data FROM board_strokes WHERE room = ? ORDER BY position").all(
        room,
      ) as DataRow[],
    );
  }

  clearBoard(room: string) {
    this.ensureRoom(room);
    this.stmt("DELETE FROM board_strokes WHERE room = ?").run(room);
  }

  private trimStrokes(room: string) {
    this.stmt(
      `DELETE FROM board_strokes WHERE room = ? AND stroke_id IN (
           SELECT stroke_id FROM board_strokes WHERE room = ?
           ORDER BY position DESC LIMIT -1 OFFSET ?
         )`,
    ).run(room, room, BOARD_STROKE_LIMIT);
  }

  // ── Activity log ──────────────────────────────────────

  /**
   * Add a line to the room's log and hand it back with its position, which
   * is the id the panel keys off and the order it reads in.
   */
  recordActivity(
    room: string,
    entry: { kind: string; actor: string; text: string; detail?: string; at?: string },
  ): ActivityEntry {
    this.ensureRoom(room);
    const row = this.stmt("SELECT MAX(position) AS edge FROM activity WHERE room = ?").get(
      room,
    ) as { edge: number | null };
    const position = (row?.edge ?? 0) + 1;
    const at = entry.at ?? new Date().toISOString();

    this.stmt(
      "INSERT INTO activity (room, position, at, kind, actor, text, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      room,
      position,
      at,
      entry.kind,
      entry.actor.slice(0, 40),
      entry.text.slice(0, 400),
      entry.detail?.slice(0, 200) ?? null,
    );

    this.stmt(
      `DELETE FROM activity WHERE room = ? AND position IN (
           SELECT position FROM activity WHERE room = ? ORDER BY position DESC LIMIT -1 OFFSET ?
         )`,
    ).run(room, room, ACTIVITY_LIMIT);

    return {
      id: position,
      at,
      kind: entry.kind as ActivityEntry["kind"],
      actor: entry.actor,
      text: entry.text,
      ...(entry.detail ? { detail: entry.detail } : {}),
    };
  }

  /** The log, oldest first, which is how it reads. */
  listActivity(room: string, limit = ACTIVITY_LIMIT): ActivityEntry[] {
    this.ensureRoom(room);
    const rows = this.stmt(
      `SELECT position, at, kind, actor, text, detail FROM activity
         WHERE room = ? ORDER BY position DESC LIMIT ?`,
    ).all(room, limit) as Array<{
      position: number;
      at: string;
      kind: string;
      actor: string;
      text: string;
      detail: string | null;
    }>;

    return rows
      .map((row) => ({
        id: row.position,
        at: row.at,
        kind: row.kind as ActivityEntry["kind"],
        actor: row.actor,
        text: row.text,
        ...(row.detail ? { detail: row.detail } : {}),
      }))
      .reverse();
  }

  // ── Pinball ───────────────────────────────────────────

  /**
   * Record a finished game and return the table as it now stands.
   *
   * Every game is kept rather than only the best three: the board is a view
   * over the history, so a score that falls off it when somebody does better
   * is still there, and "who has played" stays answerable.
   */
  recordPinballScore(room: string, player: string, score: number): PinballScore[] {
    this.ensureRoom(room);
    this.stmt(
      "INSERT INTO pinball_scores (room, player, score, scored_at) VALUES (?, ?, ?, ?)",
    ).run(room, player.slice(0, 16), Math.max(0, Math.round(score)), new Date().toISOString());

    return this.topPinballScores(room);
  }

  /** The high score table: the best games in this room, best first. */
  topPinballScores(room: string, limit = PINBALL_HIGH_SCORES): PinballScore[] {
    this.ensureRoom(room);
    return this.stmt(
      `SELECT player, score, scored_at FROM pinball_scores
         WHERE room = ? ORDER BY score DESC, scored_at ASC LIMIT ?`,
    ).all(room, limit) as unknown as PinballScore[];
  }

  // ── The arcade cabinet ────────────────────────────────

  /** Like the cauldron's board, one per game in the cabinet. */
  recordArcadeScore(room: string, game: string, player: string, score: number): PinballScore[] {
    this.ensureRoom(room);
    this.stmt(
      "INSERT INTO arcade_scores (room, game, player, score, scored_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      room,
      game,
      player.slice(0, 16),
      Math.max(0, Math.round(score)),
      new Date().toISOString(),
    );
    return this.topArcadeScores(room, game);
  }

  topArcadeScores(room: string, game: string, limit = PINBALL_HIGH_SCORES): PinballScore[] {
    this.ensureRoom(room);
    return this.stmt(
      `SELECT player, score, scored_at FROM arcade_scores
         WHERE room = ? AND game = ? ORDER BY score DESC, scored_at ASC LIMIT ?`,
    ).all(room, game, limit) as unknown as PinballScore[];
  }

  // ── Achievements ──────────────────────────────────────

  /**
   * Record an achievement. Returns true only the first time, so callers can
   * treat a true result as "announce this" without tracking state themselves.
   */
  award(
    room: string,
    subjectType: string,
    subjectId: string,
    code: string,
    subjectName: string,
  ): boolean {
    this.ensureRoom(room);
    const result = this.stmt(
      `INSERT OR IGNORE INTO achievements
           (room, subject_type, subject_id, code, subject_name, earned_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(room, subjectType, subjectId, code, subjectName, new Date().toISOString());
    return result.changes > 0;
  }

  listAchievements(room: string) {
    this.ensureRoom(room);
    return this.stmt(
      `SELECT subject_type AS subjectType, subject_id AS subjectId, code,
                subject_name AS subjectName, earned_at AS earnedAt
         FROM achievements WHERE room = ? ORDER BY earned_at`,
    ).all(room) as Array<{
      subjectType: string;
      subjectId: string;
      code: string;
      subjectName: string;
      earnedAt: string;
    }>;
  }

  /** How many tasks a seat has finished, for "first time" style rules. */
  countCompletedTasksForSeat(room: string, seatId: string): number {
    this.ensureRoom(room);
    const row = this.stmt(
      "SELECT COUNT(*) AS n FROM tasks WHERE room = ? AND seat_id = ? AND status = ?",
    ).get(room, seatId, "completed") as { n: number } | undefined;
    return row?.n ?? 0;
  }

  /** Seats a given person has given work to, and how many seats are staffed. */
  assignmentBreadth(room: string, requesterName: string): { assigned: number; staffed: number } {
    this.ensureRoom(room);
    const assigned = this.stmt(
      `SELECT COUNT(DISTINCT seat_id) AS n FROM tasks
         WHERE room = ? AND requested_by_name = ? AND seat_id IS NOT NULL`,
    ).get(room, requesterName) as { n: number } | undefined;

    const seats = parseRows(
      this.stmt("SELECT data FROM seats WHERE room = ?").all(room) as DataRow[],
    ) as Array<{ assigned?: boolean }>;

    return {
      assigned: assigned?.n ?? 0,
      staffed: seats.filter((seat) => seat.assigned).length,
    };
  }

  /**
   * Record what a run cost. Spend is tracked server-side because it is what a
   * ceiling has to be enforced against — a client could simply not report it.
   */
  addSpend(room: string, usd: number) {
    if (!Number.isFinite(usd) || usd <= 0) return;
    this.ensureRoom(room);
    this.stmt("UPDATE rooms SET spend_usd = spend_usd + ? WHERE slug = ?").run(usd, room);
  }

  /** True once this room has spent its allowance. */
  isOverBudget(room: string): boolean {
    return this.getSpend(room) >= ROOM_SPEND_LIMIT_USD;
  }

  getSpend(room: string): number {
    this.ensureRoom(room);
    const row = this.stmt("SELECT spend_usd FROM rooms WHERE slug = ?").get(room) as
      | { spend_usd: number }
      | undefined;
    return row?.spend_usd ?? 0;
  }

  ensureRoom(room: string) {
    this.stmt("INSERT OR IGNORE INTO rooms (slug, created_at) VALUES (?, ?)").run(
      room,
      new Date().toISOString(),
    );
  }

  getSnapshot(room: string): RoomSnapshot {
    this.ensureRoom(room);

    const roomRow = this.stmt("SELECT active_session_key FROM rooms WHERE slug = ?").get(room) as
      | { active_session_key: string | null }
      | undefined;

    return {
      tasks: parseRows(
        this.stmt("SELECT data FROM tasks WHERE room = ? ORDER BY position").all(room) as DataRow[],
      ),
      messages: parseRows(
        this.stmt("SELECT data FROM messages WHERE room = ? ORDER BY position").all(
          room,
        ) as DataRow[],
      ),
      sessions: parseRows(
        this.stmt("SELECT data FROM sessions WHERE room = ? ORDER BY position").all(
          room,
        ) as DataRow[],
      ),
      seats: parseRows(
        this.stmt("SELECT data FROM seats WHERE room = ? ORDER BY seat_id").all(room) as DataRow[],
      ),
      activeSessionKey: roomRow?.active_session_key ?? null,
    };
  }

  /**
   * The room's active session, on its own.
   *
   * The one field of a snapshot that anything asks for by itself, and
   * `getSnapshot` is an expensive way to get it: every task, message,
   * session and seat in the room, read off disk and JSON-parsed, to return
   * one string.
   */
  activeSessionKey(room: string): string | null {
    this.ensureRoom(room);
    const row = this.stmt("SELECT active_session_key FROM rooms WHERE slug = ?").get(room) as
      | { active_session_key: string | null }
      | undefined;
    return row?.active_session_key ?? null;
  }

  /**
   * Whether anybody has ever spoken in this room, for the "first thing said"
   * badge.
   *
   * `author_type` is the message's `role`, written by `appendMessage`, so
   * this is a one-row existence check against an indexed column rather than
   * parsing the room's whole history to look at a single field of it. It is
   * asked on every line anybody says.
   */
  hasSpoken(room: string): boolean {
    this.ensureRoom(room);
    const row = this.stmt(
      "SELECT 1 AS found FROM messages WHERE room = ? AND author_type = 'player' LIMIT 1",
    ).get(room) as { found: number } | undefined;
    return row !== undefined;
  }

  setActiveSessionKey(room: string, key: string | null) {
    this.ensureRoom(room);
    this.stmt("UPDATE rooms SET active_session_key = ? WHERE slug = ?").run(key, room);
  }

  /**
   * The client owns ordering and trimming of these collections today, so a
   * write replaces the room's whole slice inside one transaction. Per-entity
   * events arrive with the shared-world phase.
   */
  replaceTasks(room: string, tasks: Record<string, unknown>[]) {
    this.ensureRoom(room);
    const capped = tasks.slice(0, LIMITS.tasks);
    this.transaction(() => {
      this.stmt("DELETE FROM tasks WHERE room = ?").run(room);
      const insert = this.stmt(
        `INSERT INTO tasks (room, task_id, seat_id, session_key, status, requested_by, created_at, position, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      capped.forEach((task, index) => {
        const id = asString(task.taskId) ?? asString(task.runId);
        if (!id) return;
        insert.run(
          room,
          id,
          asString(task.seatId),
          asString(task.sessionKey),
          asString(task.status),
          asString(task.requestedBy) ?? LOCAL_PLAYER,
          asString(task.createdAt) ?? new Date().toISOString(),
          index,
          JSON.stringify(task),
        );
      });
    });
  }

  replaceMessages(room: string, messages: Record<string, unknown>[]) {
    this.ensureRoom(room);
    const capped = messages.slice(-LIMITS.messages);
    this.transaction(() => {
      this.stmt("DELETE FROM messages WHERE room = ?").run(room);
      const insert = this.stmt(
        `INSERT INTO messages (room, message_id, session_key, author_type, author, created_at, position, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      capped.forEach((message, index) => {
        const id = asString(message.id);
        if (!id) return;
        // "role" today is assistant/user/system; players become a fourth author type
        insert.run(
          room,
          id,
          asString(message.sessionKey),
          asString(message.role) ?? "system",
          asString(message.actorName),
          asString(message.timestamp) ?? new Date().toISOString(),
          index,
          JSON.stringify(message),
        );
      });
    });
  }

  replaceSessions(room: string, sessions: Record<string, unknown>[]) {
    this.ensureRoom(room);
    const capped = sessions.slice(0, LIMITS.sessions);
    this.transaction(() => {
      this.stmt("DELETE FROM sessions WHERE room = ?").run(room);
      const insert = this.stmt(
        "INSERT INTO sessions (room, session_key, updated_at, position, data) VALUES (?, ?, ?, ?, ?)",
      );
      capped.forEach((session, index) => {
        const key = asString(session.sessionKey) ?? asString(session.key);
        if (!key) return;
        insert.run(room, key, new Date().toISOString(), index, JSON.stringify(session));
      });
    });
  }

  replaceSeats(room: string, seats: Record<string, unknown>[]) {
    this.ensureRoom(room);
    this.transaction(() => {
      this.stmt("DELETE FROM seats WHERE room = ?").run(room);
      const insert = this.stmt(
        "INSERT INTO seats (room, seat_id, updated_at, data) VALUES (?, ?, ?, ?)",
      );
      const now = new Date().toISOString();
      for (const seat of seats) {
        const id = asString(seat.seatId);
        if (!id) continue;
        insert.run(room, id, now, JSON.stringify(seat));
      }
    });
  }

  // ── Per-entity writes ─────────────────────────────────
  // A shared room cannot use whole-slice writes: two people acting at once
  // would each send a list that omits the other's work, and the later write
  // would erase it. These apply one change at a time.

  upsertTask(room: string, task: Record<string, unknown>) {
    this.ensureRoom(room);
    const id = asString(task.taskId) ?? asString(task.runId);
    if (!id) return;

    const existing = this.stmt("SELECT position FROM tasks WHERE room = ? AND task_id = ?").get(
      room,
      id,
    ) as { position: number } | undefined;

    // New tasks go to the head, matching the newest-first list the client keeps
    const position = existing?.position ?? this.nextHeadPosition(room, "tasks");

    this.stmt(
      `INSERT INTO tasks (room, task_id, seat_id, session_key, status, requested_by, created_at, position, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (room, task_id) DO UPDATE SET
           seat_id = excluded.seat_id,
           session_key = excluded.session_key,
           status = excluded.status,
           requested_by = COALESCE(excluded.requested_by, tasks.requested_by),
           data = excluded.data`,
    ).run(
      room,
      id,
      asString(task.seatId),
      asString(task.sessionKey),
      asString(task.status),
      asString(task.requestedBy),
      asString(task.createdAt) ?? new Date().toISOString(),
      position,
      JSON.stringify(task),
    );

    // Kept in a column so "gave work to every seat" is a query rather than a scan
    const requesterName = asString(task.requestedByName);
    if (requesterName) {
      this.stmt("UPDATE tasks SET requested_by_name = ? WHERE room = ? AND task_id = ?").run(
        requesterName,
        room,
        id,
      );
    }

    this.trim(room, "tasks", LIMITS.tasks, "DESC");
  }

  appendMessage(room: string, message: Record<string, unknown>) {
    this.ensureRoom(room);
    const id = asString(message.id);
    if (!id) return;

    const existing = this.stmt(
      "SELECT position FROM messages WHERE room = ? AND message_id = ?",
    ).get(room, id) as { position: number } | undefined;

    const position = existing?.position ?? this.nextTailPosition(room, "messages");

    this.stmt(
      `INSERT INTO messages (room, message_id, session_key, author_type, author, created_at, position, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (room, message_id) DO UPDATE SET
           session_key = excluded.session_key,
           author_type = excluded.author_type,
           author = excluded.author,
           data = excluded.data`,
    ).run(
      room,
      id,
      asString(message.sessionKey),
      asString(message.role) ?? "system",
      asString(message.actorName) ?? asString(message.author),
      asString(message.timestamp) ?? new Date().toISOString(),
      position,
      JSON.stringify(message),
    );

    this.trim(room, "messages", LIMITS.messages, "ASC");
  }

  upsertSeat(room: string, seat: Record<string, unknown>) {
    this.ensureRoom(room);
    const id = asString(seat.seatId);
    if (!id) return;

    this.stmt(
      `INSERT INTO seats (room, seat_id, updated_at, data) VALUES (?, ?, ?, ?)
         ON CONFLICT (room, seat_id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
    ).run(room, id, new Date().toISOString(), JSON.stringify(seat));
  }

  upsertSession(room: string, session: Record<string, unknown>) {
    this.ensureRoom(room);
    const key = asString(session.sessionKey) ?? asString(session.key);
    if (!key) return;

    const existing = this.stmt(
      "SELECT position FROM sessions WHERE room = ? AND session_key = ?",
    ).get(room, key) as { position: number } | undefined;

    this.stmt(
      `INSERT INTO sessions (room, session_key, updated_at, position, data) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (room, session_key) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
    ).run(
      room,
      key,
      new Date().toISOString(),
      existing?.position ?? this.nextHeadPosition(room, "sessions"),
      JSON.stringify(session),
    );

    this.trim(room, "sessions", LIMITS.sessions, "DESC");
  }

  /** Newest-first collections grow downward from the current minimum. */
  private nextHeadPosition(room: string, table: "tasks" | "sessions"): number {
    const row = this.stmt(`SELECT MIN(position) AS edge FROM ${table} WHERE room = ?`).get(
      room,
    ) as { edge: number | null };
    return (row?.edge ?? 0) - 1;
  }

  /** Oldest-first collections grow upward from the current maximum. */
  private nextTailPosition(room: string, table: "messages"): number {
    const row = this.stmt(`SELECT MAX(position) AS edge FROM ${table} WHERE room = ?`).get(
      room,
    ) as { edge: number | null };
    return (row?.edge ?? 0) + 1;
  }

  /**
   * Keep a collection within its cap, dropping from the end that matters least:
   * the oldest chat, and the oldest tasks and sessions.
   */
  private trim(
    room: string,
    table: "tasks" | "messages" | "sessions",
    limit: number,
    keep: "ASC" | "DESC",
  ) {
    const idColumn =
      table === "tasks" ? "task_id" : table === "messages" ? "message_id" : "session_key";
    this.stmt(
      `DELETE FROM ${table} WHERE room = ? AND ${idColumn} IN (
           SELECT ${idColumn} FROM ${table} WHERE room = ?
           ORDER BY position ${keep === "ASC" ? "DESC" : "ASC"}
           LIMIT -1 OFFSET ?
         )`,
    ).run(room, room, limit);
  }

  private transaction(fn: () => void) {
    this.db.exec("BEGIN");
    try {
      fn();
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
}

/**
 * Next.js reloads modules in dev, so the handle hangs off globalThis to avoid
 * opening a second connection to the same file on every hot reload.
 */
const globalForStore = globalThis as unknown as { __roomStore?: RoomStore };

export function getRoomStore(): RoomStore {
  if (!globalForStore.__roomStore) {
    globalForStore.__roomStore = new RoomStore(DB_PATH);
  }
  return globalForStore.__roomStore;
}
