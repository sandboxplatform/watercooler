/**
 * Room store — what the world keeps once the people in it have gone home.
 *
 * Backed by SQLite through node's built-in driver, so there is no native
 * dependency and no service to run locally. All SQL lives in this module: the
 * move to Postgres in the hosting phase should be a swap here, not a change at
 * every call site. What the tables are, and how an older file is brought up
 * to them, is `room-schema.ts`.
 *
 * Badges, eggs, high scores, the whiteboard, accounts and a handful of
 * settings. Who is where right now is not here: that is presence, and it is
 * the socket's, in memory.
 */

import { DatabaseSync, type StatementSync } from "node:sqlite";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { createLogger } from "../logger";
import { normaliseEmail, type Account, type AccountProfile, type SignedIn } from "../accounts";
import { isGuestHolder } from "../badges";
import { personIdForEmail } from "./person-id";
import { MIGRATIONS } from "./room-schema";

const log = createLogger("RoomStore");

/** Single-player still means one room; multiplayer gives it a real slug. */
export const DEFAULT_ROOM = process.env.ROOM_SLUG ?? "local";

const DB_PATH = process.env.ROOM_DB_PATH ?? join(process.cwd(), ".data", "watercooler.sqlite");

/** How many strokes one board keeps before the oldest are dropped. */
const BOARD_STROKE_LIMIT = 2000;

/**
 * How long a write waits on a lock held by another connection before it
 * fails. Without it SQLite answers "database is locked" at once, and the
 * one process that holds this file is not the only thing that can open it —
 * a backup, a second server during a deploy's overlap, a test run.
 */
const BUSY_TIMEOUT_MS = 5000;

/** How many names the cauldron remembers. */
export const PINBALL_HIGH_SCORES = 3;

export interface PinballScore {
  player: string;
  score: number;
  scored_at: string;
}

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

export class RoomStore {
  private db: DatabaseSync;

  /**
   * Compiled statements, kept by their SQL.
   *
   * `prepare` parses and plans the statement every time it is called, and
   * every method here called it afresh. The SQL is a fixed set of literals, so
   * it compiles once and is reused for the life of the process, which is
   * what a prepared statement is for.
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
      // Durable under WAL all the same: a commit can be lost to a power cut,
      // never corrupted, and a stroke or a badge is not worth an fsync each.
      this.db.exec("PRAGMA synchronous = NORMAL");
      this.db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
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
   * The store is one handle for the life of the process, and the server
   * lets it go on the way down (`closeRoomStore`), so the WAL is folded back
   * into the file rather than left for the next boot. A test that opens a
   * database on disk needs it too: it cannot delete the file afterwards
   * while something still holds it, which on Windows is an error.
   */
  close() {
    // The compiled statements hold the file too, so they go first.
    this.statements.clear();
    this.db.close();
  }

  /** Whether the database answers at all. What the health probe asks. */
  ping(): boolean {
    return (this.stmt("SELECT 1 AS ok").get() as { ok: number } | undefined)?.ok === 1;
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
    return this.getAccount(email)!;
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
      // A damaged blob counts for nothing.
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
   * Add a stroke, or replace the one already kept under its id — a stroke
   * sent twice is one stroke, and it keeps its place in the drawing order.
   *
   * One transaction, so the edge read and the insert after it cannot be
   * split by another write; and the board is trimmed only when a row was
   * added, since an update cannot have made it any longer. It used to trim
   * on every call, and a stroke streamed while it was drawn was a call a
   * frame.
   */
  addStroke(room: string, strokeId: string, data: unknown) {
    const json = JSON.stringify(data);
    this.transaction(() => {
      const updated = this.stmt(
        "UPDATE board_strokes SET data = ? WHERE room = ? AND stroke_id = ?",
      ).run(json, room, strokeId);
      if (updated.changes > 0) return;

      const row = this.stmt("SELECT MAX(position) AS edge FROM board_strokes WHERE room = ?").get(
        room,
      ) as { edge: number | null };
      this.stmt(
        "INSERT INTO board_strokes (room, stroke_id, position, data) VALUES (?, ?, ?, ?)",
      ).run(room, strokeId, (row?.edge ?? 0) + 1, json);
      this.trimStrokes(room);
    });
  }

  listStrokes(room: string): unknown[] {
    return parseRows(
      this.stmt("SELECT data FROM board_strokes WHERE room = ? ORDER BY position").all(
        room,
      ) as unknown as DataRow[],
    );
  }

  clearBoard(room: string) {
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

  // ── Pinball ───────────────────────────────────────────

  /**
   * Record a finished game and return the table as it now stands.
   *
   * Every game is kept rather than only the best three: the board is a view
   * over the history, so a score that falls off it when somebody does better
   * is still there, and "who has played" stays answerable.
   */
  recordPinballScore(room: string, player: string, score: number): PinballScore[] {
    this.stmt(
      "INSERT INTO pinball_scores (room, player, score, scored_at) VALUES (?, ?, ?, ?)",
    ).run(room, player.slice(0, 16), Math.max(0, Math.round(score)), new Date().toISOString());

    return this.topPinballScores(room);
  }

  /** The high score table: the best games in this room, best first. */
  topPinballScores(room: string, limit = PINBALL_HIGH_SCORES): PinballScore[] {
    return this.stmt(
      `SELECT player, score, scored_at FROM pinball_scores
         WHERE room = ? ORDER BY score DESC, scored_at ASC LIMIT ?`,
    ).all(room, limit) as unknown as PinballScore[];
  }

  // ── The arcade cabinet ────────────────────────────────

  /** Like the cauldron's board, one per game in the cabinet. */
  recordArcadeScore(room: string, game: string, player: string, score: number): PinballScore[] {
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
    return this.stmt(
      `SELECT player, score, scored_at FROM arcade_scores
         WHERE room = ? AND game = ? ORDER BY score DESC, scored_at ASC LIMIT ?`,
    ).all(room, game, limit) as unknown as PinballScore[];
  }

  // ── Badges ────────────────────────────────────────────

  /**
   * Hang a badge on somebody. Returns true only the first time, so a caller
   * can treat a true result as "announce this" without tracking state.
   *
   * No room: a badge is the person's and follows them through every door.
   * The name is kept alongside so a row reads on its own, whoever is in
   * the world when somebody looks.
   *
   * Never for a guest, and that is said here as well as on the socket: this
   * is where a record is kept, so it is the one place a guest's cannot be
   * written from whichever caller forgets. See `isGuestHolder`.
   */
  awardBadge(person: string, code: string, name: string): boolean {
    if (isGuestHolder(person)) return false;
    const result = this.stmt(
      `INSERT OR IGNORE INTO badges (person, code, name, earned_at) VALUES (?, ?, ?, ?)`,
    ).run(person, code, name.slice(0, 32), new Date().toISOString());
    // Somebody who changed their name after earning it should read as who
    // they are now; the insert above does nothing on a badge already held.
    if (result.changes === 0) return false;
    return true;
  }

  /**
   * Note that somebody has done one distinct thing — been in one building,
   * played one game, stood beside one resident.
   *
   * The set, not the count: every badge built on more than one moment asks
   * "have they done each of these", so two visits to the same lobby must
   * count once. Returns true when the mark is new, which is the only moment
   * worth re-checking a badge on. Never for a guest, like the badge itself.
   */
  mark(person: string, mark: string): boolean {
    if (isGuestHolder(person)) return false;
    return (
      this.stmt("INSERT OR IGNORE INTO badge_marks (person, mark) VALUES (?, ?)").run(person, mark)
        .changes > 0
    );
  }

  /** How many distinct marks somebody holds under a prefix — "org:", "game:". */
  countMarks(person: string, prefix: string): number {
    const row = this.stmt(
      "SELECT COUNT(*) AS n FROM badge_marks WHERE person = ? AND mark LIKE ? ESCAPE '\\'",
    ).get(person, `${prefix.replace(/[%_\\]/g, "\\$&")}%`) as { n: number };
    return row.n;
  }

  /** Every badge anybody holds, newest last. The whole world's, and a small table. */
  listBadges(): Array<{ person: string; name: string; code: string; earnedAt: string }> {
    return this.stmt(
      `SELECT person, name, code, earned_at AS earnedAt FROM badges ORDER BY earned_at`,
    ).all() as unknown as Array<{
      person: string;
      name: string;
      code: string;
      earnedAt: string;
    }>;
  }

  /**
   * One egg into somebody's basket.
   *
   * The name is kept beside it for the reason a badge keeps one: a row
   * should read without the roster, and whoever found it may not be in the
   * world when somebody looks. `id` is the egg's own, minted when it was
   * laid, so collecting the same egg twice — which the field will not
   * allow anyway — cannot double it.
   *
   * Answers whether it went in, which is never for a guest: a guest has no
   * basket, and the socket leaves the egg in the grass rather than asking.
   */
  collectEgg(person: string, name: string, tier: string, id: string, at = new Date()): boolean {
    if (isGuestHolder(person)) return false;
    return (
      this.stmt(
        `INSERT OR IGNORE INTO eggs (id, person, name, tier, found_at) VALUES (?, ?, ?, ?, ?)`,
      ).run(id, person, name.slice(0, 32), tier, at.toISOString()).changes > 0
    );
  }

  /**
   * Every basket in the world, by person and kind.
   *
   * A tally rather than the rows, because that is what every question
   * anybody asks of a basket wants and it is the one shape with a bound on
   * it: people times the rungs of the ladder, where the rows themselves
   * grow for as long as the world runs.
   *
   * `name` is the one they found the most recent of that kind under, so
   * somebody who has changed theirs reads as who they are now. That is
   * SQLite's own rule rather than an accident: a bare column in a query
   * with `MAX` on it takes its value from the row that matched — which is
   * why the `MAX(found_at)` above is what makes this line true, and why
   * adding a second aggregate would quietly stop it being so.
   */
  eggTallies(): Array<{
    person: string;
    name: string;
    tier: string;
    count: number;
    latest: string;
  }> {
    return this.stmt(
      `SELECT person,
              tier,
              COUNT(*) AS count,
              MAX(found_at) AS latest,
              name
         FROM eggs
        GROUP BY person, tier
        ORDER BY person, latest`,
    ).all() as unknown as Array<{
      person: string;
      name: string;
      tier: string;
      count: number;
      latest: string;
    }>;
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

/**
 * Let the shared handle go, if one was ever opened. For shutdown: opening
 * the database only to close it would be a migration run on the way out.
 */
export function closeRoomStore(): void {
  const store = globalForStore.__roomStore;
  if (!store) return;
  globalForStore.__roomStore = undefined;
  store.close();
}
