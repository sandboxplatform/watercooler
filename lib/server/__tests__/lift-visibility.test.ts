import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import type { PresencePlayer } from "../../presence-types";

/**
 * Somebody in the lift is not drawn in anybody else's room.
 *
 * Their own browser has always hidden them — the car is a hole in the wall
 * and the character stood in front of it — but nothing said so to the room,
 * so everyone else watched them idle in the doorway, name tag and all, for
 * as long as they took to choose a floor.
 *
 * Driven over real sockets, because what broke was the wiring rather than
 * the rule: a message type the socket does not recognise is dropped without
 * a word, and the roster is the only place the answer shows up.
 */

// Both of these are read when the module under test is first loaded, which
// is why the import below is awaited rather than written at the top.
//
// A room database of this file's own, because a real server opens one and
// two servers in one run share the suite's: this file and
// `presence-identity` are in different projects, so they run at the same
// time and SQLite answers the second one "database is locked".
process.env.ROOM_DB_PATH = join(tmpdir(), `watercooler-lift-${process.pid}.sqlite`);
process.env.ACCESS_CODE = "test-visitors-share-this-one";

const { attachPresenceSocket } = await import("../presence-socket");
const { ACCESS_COOKIE, mintToken } = await import("../access");

const cookie = () => `${ACCESS_COOKIE}=${mintToken("visitor")}`;

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((_req, res) => res.end("ok"));
  attachPresenceSocket(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

interface Person {
  socket: WebSocket;
  id: string;
  /** The last roster this connection was sent. */
  roster: PresencePlayer[];
  join(room: string): void;
}

/** Open a connection as a visitor and walk into a room. */
async function walkIn(name: string, room: string): Promise<Person> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket`, {
    headers: { cookie: cookie(), origin: `http://127.0.0.1:${port}` },
  });
  const join = (into: string) =>
    socket.send(
      JSON.stringify({
        type: "join",
        room: into,
        name,
        spriteKey: "player",
        x: 400,
        y: 400,
        facing: "down",
      }),
    );
  const person: Person = { socket, id: "", roster: [], join };
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as {
      type: string;
      you?: string;
      players?: PresencePlayer[];
    };
    if (message.type === "welcome" && message.you) person.id = message.you;
    if (message.players) person.roster = message.players;
  });
  await new Promise<void>((done) => socket.on("open", () => (join(room), done())));
  await until(() => person.id !== "");
  return person;
}

/** Wait for something to become true, rather than for a fixed moment. */
async function until(ready: () => boolean, ms = 4000) {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
}

/** How the other person in the room currently sees them. */
const seenBy = (watcher: Person, subject: Person) =>
  watcher.roster.find((p) => p.id === subject.id);

describe("stepping into the lift", () => {
  it("stops the room drawing them, and starts again when they step out", async () => {
    const rider = await walkIn("Rider", "lift-lobby");
    const watcher = await walkIn("Watcher", "lift-lobby");
    await until(() => seenBy(watcher, rider) !== undefined);
    expect(seenBy(watcher, rider)?.hidden).toBeUndefined();

    rider.socket.send(JSON.stringify({ type: "boarded", inside: true }));
    await until(() => seenBy(watcher, rider)?.hidden === true);
    // Out of sight, not out of the room: they still hold one of its places.
    expect(watcher.roster).toHaveLength(2);

    rider.socket.send(JSON.stringify({ type: "boarded", inside: false }));
    await until(() => seenBy(watcher, rider)?.hidden === undefined);
    expect(seenBy(watcher, rider)).toMatchObject({ name: "Rider" });

    rider.socket.close();
    watcher.socket.close();
  });

  it("does not carry up to the floor they ride to", async () => {
    // Unlike a microphone, which stays on through a door. A ride is a join
    // to another room, and arriving invisible is the worse bug of the two.
    const rider = await walkIn("Rider", "lift-lobby-2");
    const upstairs = await walkIn("Upstairs", "lift-lobby-2-floor-1");
    rider.socket.send(JSON.stringify({ type: "boarded", inside: true }));
    await until(() => rider.roster.some((p) => p.id === rider.id && p.hidden));

    rider.join("lift-lobby-2-floor-1");
    await until(() => seenBy(upstairs, rider) !== undefined);
    expect(seenBy(upstairs, rider)?.hidden).toBeUndefined();

    rider.socket.close();
    upstairs.socket.close();
  });
});
