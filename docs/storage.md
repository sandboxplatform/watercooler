# Storage

The room database, its migrations, and a database per test file. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## Storage

One SQLite database (`node:sqlite`), the **room store**
(`lib/server/room-store.ts`, `ROOM_DB_PATH`): accounts, badges and their
marks, eggs, scores, the whiteboard, and settings. Its schema and migrations
are `lib/server/room-schema.ts`. It runs in WAL with `synchronous = NORMAL`
(safe under WAL, and one fsync per checkpoint rather than per commit) and a
five-second `busy_timeout` for the moment somebody opens the file by hand.

There used to be a second, the ERP — a fictional company's data, seeded on
first boot for the agents to query. Nothing has read it since the agents
went, and it is gone: `lib/erp/`, the seed and `ERP_DB_PATH`. An old
`.data/erp.sqlite` is simply left where it is.

Migrations 2 and 3 are what took the agents out of a database that already
held them: `activity`, then `tasks` and `sessions`, dropped with their
indexes. Migration 4 took `messages` with the chat, which is the same
argument one step later: the rows were the agents' transcript and, after
them, remarks typed into a window beside the office, and nothing reads
either.

Migration 9 finished the job: `players` (never touched), `rooms` (written on
every read path by an `ensureRoom` that nothing then read) and `seats` (no
generated map has a worker spawn, so no seat ever existed to keep) are
dropped, and `ensureRoom` with them.

Migration 5 is the odd one, because it **drops a table and keeps nothing**.
`achievements` went and `badges` and `badge_marks` came in, with no
backfill between them: the old rows were filed under a _room_, half of them
were an agent's from when the world ran agents, and of the two codes left
only one survives by name. There was nothing to carry over, and a badge
half-carried is worse than a shelf that starts empty — everybody begins with
none, which is the honest state for a catalogue nobody has yet had a chance
at. See **Badges** for the shape that replaced it.

Migration 6 adds `eggs`, which is the other half of **The eggs**: the field
of them lying in the park is in memory beside the basketball, because that
is something happening, and what somebody picked up is kept, because a
basket is a person's. One row per egg rather than a count per kind — an egg
is a thing that happened at a time — and everything read back off it is a
tally, which is bounded by people times the ladder where the rows are
bounded by nothing.

Migration 8 **deletes rows and changes no shape**: every badge, mark and
egg filed under a `guest:` holder, from before a guest kept nothing. Left
in, they would have gone on being listed against every badge and every
kind of egg in the world, and nothing in a row can say whose it was — so
there is nobody to give them back to, which is migration 5's argument.
(Migration 7 dropped the old desk register; see **Floors**.)

**The room store's shape is versioned.** `MIGRATIONS` in
`lib/server/room-store.ts` is every change to it in order, the index being
the version it brings the database _to_, and `PRAGMA user_version` records
how far a file has climbed. Adding one is an entry there; it runs once, in
its own transaction with the version stamped inside it, so a database is
either at the version before or the one after and never halfway between.

That is what makes room for a change that is not another column — a rename,
a backfill, an index rebuilt. There was nowhere to put one before, because
nothing recorded what shape a database was in: migration was a list of
`ALTER TABLE` statements in a `try {} catch {}` that swallowed everything,
re-attempted on every open for ever. It worked, and it could not tell the
ordinary case of the column already being there from a typo, a locked file
or a full disk — all three came back as the same silence, and a database
that had failed to migrate went on being written to.

Two things follow from it:

- **A migration that fails takes the server with it**, naming itself and the
  SQL error. The alternative is writing rows into a shape that was never
  finished.
- **A database newer than the build is refused**, saying both versions.
  Rolling a build back is fair in an emergency, but the older one cannot
  know whether it can still write the newer shape, and guessing wrong
  corrupts a room quietly.

The baseline migration asks before it adds, because everything from before
the ladder sits at version 0 with the tables and — depending on its age —
some of the columns. From version 2 on, the version is the answer and a
migration can assume the one before it ran.

**Every test file gets a room database of its own**, in the OS temp
directory, from `ROOM_DB_PATH` in `vitest.setup.ts`. Three files drive real
servers — `presence-identity`, `voice-reach`, `lift-visibility` — a real
server opens the room store, and left alone that is the one in `.data/` with
somebody's actual rooms and board scribbles in it.

It was one database per run, in `vitest.config.ts`'s `env`, and those three
raced each other for it: SQLite answers the second writer "database is
locked", which arrived as an uncaught exception and failed about one run in
three **with every test passing**. So it has to be a setup file rather than
`env` — `env` is one value for the whole run — and a setup file rather than a
hook, since the store reads the path when it is first imported and a setup
file is the last moment before a test file's own imports are evaluated.
