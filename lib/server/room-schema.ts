/**
 * The shape of the room store, and every change ever made to it.
 *
 * Kept apart from the store itself so the ladder reads as one thing: the
 * store is what the server asks of the database, this is what the database
 * is. `room-store.ts` walks a file up it on open.
 */

import type { DatabaseSync } from "node:sqlite";

/**
 * Every table as this build expects it, created if missing.
 *
 * The baseline migration runs this, so it is the current shape rather than
 * the first one: a table that has gone is left out here and dropped by the
 * migration that took it away, which is how a database of any age and a new
 * one end up the same.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS badges (
  person    TEXT NOT NULL,
  code      TEXT NOT NULL,
  name      TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  PRIMARY KEY (person, code)
);
CREATE INDEX IF NOT EXISTS badges_by_time ON badges (earned_at);

CREATE TABLE IF NOT EXISTS badge_marks (
  person TEXT NOT NULL,
  mark   TEXT NOT NULL,
  PRIMARY KEY (person, mark)
);

CREATE TABLE IF NOT EXISTS eggs (
  id       TEXT PRIMARY KEY,
  person   TEXT NOT NULL,
  name     TEXT NOT NULL,
  tier     TEXT NOT NULL,
  found_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS eggs_by_person ON eggs (person, tier);

CREATE TABLE IF NOT EXISTS board_strokes (
  room       TEXT NOT NULL,
  stroke_id  TEXT NOT NULL,
  position   INTEGER NOT NULL,
  data       TEXT NOT NULL,
  PRIMARY KEY (room, stroke_id)
);

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

export interface Migration {
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
export const MIGRATIONS: readonly Migration[] = [
  {
    name: "baseline",
    up: (db) => {
      db.exec(SCHEMA);
    },
  },
  {
    name: "drop the activity log",
    up: (db) => {
      // The panel that read it is gone, and nothing else ever did. A log
      // with no reader is rows a room goes on paying to write.
      db.exec("DROP INDEX IF EXISTS activity_by_room");
      db.exec("DROP TABLE IF EXISTS activity");
    },
  },
  {
    name: "drop tasks and sessions",
    up: (db) => {
      // Agent dispatch is gone, and these held nothing else: a task, the
      // conversation it belonged to, and what the room had spent running
      // them.
      db.exec("DROP INDEX IF EXISTS tasks_by_room");
      db.exec("DROP INDEX IF EXISTS sessions_by_room");
      db.exec("DROP TABLE IF EXISTS tasks");
      db.exec("DROP TABLE IF EXISTS sessions");
    },
  },
  {
    name: "drop the chat log",
    up: (db) => {
      // Chat is gone, and nothing reads this back or writes to it. What
      // people say to each other is Global Chat, which is audio between
      // browsers and was never kept anywhere; what a resident says is a
      // bubble that fades. The rows were the agents' transcript, and
      // latterly remarks typed into a window beside the office.
      db.exec("DROP INDEX IF EXISTS messages_by_room");
      db.exec("DROP TABLE IF EXISTS messages");
    },
  },
  {
    name: "rebuild the badges",
    up: (db) => {
      // The old catalogue is gone and nothing here is worth carrying over.
      // Its rows were filed under a *room* — so the same person earned
      // Walked In again on every floor they rode to — and half of them were
      // an agent's, from back when the world ran agents. There is nothing to
      // migrate: a badge names a deed, and neither the deeds nor the shape
      // survived. Everyone starts with an empty shelf, which is the honest
      // state for a set of badges nobody has yet had the chance to earn.
      db.exec("DROP TABLE IF EXISTS achievements");
      db.exec(`
        CREATE TABLE IF NOT EXISTS badges (
          person    TEXT NOT NULL,
          code      TEXT NOT NULL,
          name      TEXT NOT NULL,
          earned_at TEXT NOT NULL,
          PRIMARY KEY (person, code)
        );
        CREATE INDEX IF NOT EXISTS badges_by_time ON badges (earned_at);

        CREATE TABLE IF NOT EXISTS badge_marks (
          person TEXT NOT NULL,
          mark   TEXT NOT NULL,
          PRIMARY KEY (person, mark)
        );
      `);
    },
  },
  {
    name: "the egg basket",
    up: (db) => {
      // What somebody picked up out of the grass, which unlike the eggs
      // lying about in it is kept: the field is in memory beside the
      // basketball and a restart has tidied it, and a basket is a person's
      // and outlives every server there will ever be.
      //
      // A row per egg rather than a count per tier, because an egg is a
      // thing that happened at a time — the row is what lets a basket say
      // when the rainbow turned up. Everything anybody asks of it is a
      // tally over these rows, which is bounded by people times the ladder
      // where the rows are bounded by nothing.
      db.exec(`
        CREATE TABLE IF NOT EXISTS eggs (
          id       TEXT PRIMARY KEY,
          person   TEXT NOT NULL,
          name     TEXT NOT NULL,
          tier     TEXT NOT NULL,
          found_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS eggs_by_person ON eggs (person, tier);
      `);
    },
  },
  {
    name: "drop the register",
    up: (db) => {
      // A desk is the cast's now, not a browser's. This held one row per
      // browser profile that ever walked in — a name, a building, and an id
      // minted into that browser's own localStorage — and Floor 1 stood a
      // desk for each. A code names exactly one person, so the id was the
      // one thing about them that did not hold: a private window, a
      // sign-out, a cleared profile and every new machine was another row
      // and another desk with the same name on it. Sandbox ERP's floor had
      // seventeen Coops on it.
      //
      // Nothing is carried over, because there is nothing a row knows that
      // `CAST` does not: who works where is written down, and who is at a
      // keyboard right now is presence rather than a register.
      db.exec("DROP INDEX IF EXISTS people_home");
      db.exec("DROP TABLE IF EXISTS people");
    },
  },
  {
    name: "forget the guests",
    up: (db) => {
      // A guest keeps nothing now — no badge, no mark, no egg — and what
      // they kept before goes with the rule rather than lingering under it.
      // Every row here was filed under a name somebody typed on the shared
      // code, so two people called Guest shared one shelf and nothing in a
      // row can say whose it was. Left in, they would go on being listed
      // against every badge and every kind of egg in the world: a record,
      // kept for good, of people the world has decided not to remember.
      //
      // Deleted rather than carried anywhere, for the reason migration 5
      // kept nothing: there is nobody to give them back to.
      db.exec("DELETE FROM badges WHERE person LIKE 'guest:%'");
      db.exec("DELETE FROM badge_marks WHERE person LIKE 'guest:%'");
      db.exec("DELETE FROM eggs WHERE person LIKE 'guest:%'");
    },
  },
  {
    name: "drop the rooms, the players and the seats",
    up: (db) => {
      // Three tables with nothing left reading them. `players` was never
      // written at all — presence is the socket's, in memory. `rooms` was
      // written on nearly every read, one row per slug anybody asked about,
      // and never read back. `seats` held the office's desks as the
      // browsers last described them, and no map this world generates has
      // a desk for a seat to stand at; the route that read and wrote them
      // went with them.
      //
      // Nothing references any of them, so there is no foreign key to
      // untangle: every table here is keyed on a slug or a person, never
      // on a row of these.
      db.exec("DROP TABLE IF EXISTS players");
      db.exec("DROP TABLE IF EXISTS rooms");
      db.exec("DROP TABLE IF EXISTS seats");
    },
  },
];
