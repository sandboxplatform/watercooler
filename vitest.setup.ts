import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A room database of its own for every test file.
 *
 * A real server opens the room store, and `presence-identity`,
 * `voice-reach` and `lift-visibility` each start one. They ran against a
 * single file — one per run, named by the process — and they run at the same
 * time, so SQLite answered whichever asked second "database is locked". That
 * came back as an uncaught exception out of `RoomStore.ensureRoom`, by way of
 * the achievement granted to somebody joining a room, so a run failed with
 * every one of its 1,330 tests passing. Roughly one run in three, which is
 * the worst kind: too rare to be a finding and too common to ignore, and it
 * failed CI and the push gate for reasons nothing in the suite explained.
 *
 * Those three are the only files that touch the store on disk. Every other
 * room-store test already opens `:memory:` or a temp file of its own, which
 * is the pattern this brings the last three into: a database each writer is
 * the only writer of. Sharing one was never right — an assertion about what a
 * room holds is otherwise an assertion about what the rest of the suite
 * happened to leave there — and it went unnoticed because the writes involved
 * were a joining player's activity line and badge, which nothing asserts on.
 *
 * A setup file rather than `env` in the config, because `env` is one value for
 * the whole run and this has to be one per file. It has to be *this* rather
 * than a hook, too: `lib/server/room-store.ts` reads the path once, when it is
 * first imported, so the only moment to set it is before the test file's own
 * imports are evaluated — which is exactly when a setup file runs.
 *
 * The files are left in the OS temp directory, as the single shared one always
 * was. Nothing closes the store — it is a module-level handle meant to live as
 * long as its process — and Windows will not unlink an open SQLite file, so a
 * teardown that deleted them would be a teardown that mostly failed. The
 * process id groups a run's files together, for anyone wondering which run
 * left what behind.
 */
process.env.ROOM_DB_PATH = join(
  tmpdir(),
  `watercooler-test-${process.pid}-${randomUUID().slice(0, 8)}.sqlite`,
);
