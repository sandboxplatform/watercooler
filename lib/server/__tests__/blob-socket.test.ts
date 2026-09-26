import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import WebSocket from "ws";
import type { BlobBroadcast } from "../../presence-types";

/**
 * The blob, over real sockets against a real server.
 *
 * The rules are `blob.test.ts`'s and the arithmetic `lib/world/blob.test.ts`'s;
 * what is left is the part that goes quiet when it breaks. A message type
 * the socket does not recognise is dropped without a word, a leap sent to
 * the wrong room reaches nobody, and a blob published only when it sets off
 * leaves somebody walking in on an empty cave. All three look exactly like
 * a blob that is simply not there. Same shape as `basketball-socket.test.ts`
 * for the same reason.
 */

// Codes have to exist before the access module reads the environment, which
// is why the imports below are awaited rather than written at the top.
process.env.ACCESS_CODE = "test-visitors-share-this-one";

const { attachPresenceSocket } = await import("../presence-socket");
const { ACCESS_COOKIE, mintToken } = await import("../access");
const { FEET_BELOW_CENTRE } = await import("../../world/basketball");
const { leapAt } = await import("../../world/blob");
const { CAVE_ROOM_SLUG, VOLCANO_ROOM_SLUG } = await import("../../rooms");

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
  /** Every blob message this connection has been sent, in order. */
  heard: BlobBroadcast[];
  /** Stand somewhere, by a re-join — the scene's word, not held to walking speed. */
  standAt(at: { x: number; y: number }): void;
  punch(): void;
}

async function walkIn(name: string, room: string): Promise<Person> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket`, {
    headers: { cookie: cookie(), origin: `http://127.0.0.1:${port}` },
  });
  const join = (at: { x: number; y: number }) =>
    socket.send(
      JSON.stringify({ type: "join", room, name, spriteKey: "player", ...at, facing: "right" }),
    );
  const person: Person = {
    socket,
    id: "",
    heard: [],
    standAt: join,
    punch: () => socket.send(JSON.stringify({ type: "blob", action: "punch" })),
  };
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === "welcome") person.id = message.you;
    if (message.type === "blob") person.heard.push(message as BlobBroadcast);
  });
  await new Promise<void>((done) => socket.on("open", () => (join({ x: 60, y: 60 }), done())));
  await until(() => person.id !== "");
  return person;
}

/** Wait for something to become true, rather than for a fixed moment. */
async function until(ready: () => boolean, ms = 4000) {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the blob in the cave", () => {
  it("is told to somebody walking in, even while it sits still", async () => {
    const coop = await walkIn("Coop", CAVE_ROOM_SLUG);
    await until(() => coop.heard.length > 0);
    expect(coop.heard[0].leap).toMatchObject({ from: expect.any(Object), to: expect.any(Object) });
    expect(coop.heard[0].punched).toBeUndefined();
    coop.socket.close();
  });

  it("is punched by whoever stands next to it, for the whole cave to see — and nobody outside", async () => {
    const coop = await walkIn("Coop", CAVE_ROOM_SLUG);
    const rob = await walkIn("Rob", CAVE_ROOM_SLUG);
    const nick = await walkIn("Nick", VOLCANO_ROOM_SLUG);
    await until(() => coop.heard.length > 0);

    // Wherever it is sitting now, stand with your feet on it and swing. It
    // may set off on a hop in between, so a swing that misses is retried
    // against where it has got to.
    let landed = false;
    for (let attempt = 0; attempt < 10 && !landed; attempt++) {
      const last = coop.heard[coop.heard.length - 1];
      const at = leapAt(last.leap, last.leap.ms + last.leap.rest);
      coop.standAt({ x: at.x, y: at.y - FEET_BELOW_CENTRE });
      await pause(80);
      coop.punch();
      await until(() => rob.heard.some((m) => m.punched), 600);
      landed = rob.heard.some((m) => m.punched);
    }
    const punched = rob.heard.find((m) => m.punched)!;
    expect(punched.punched).toEqual({ by: "Coop", id: coop.id });
    expect(punched.leap.kind).toBe("knocked");
    // The beach has no use for a blob's leaps.
    expect(nick.heard).toEqual([]);

    for (const p of [coop, rob, nick]) p.socket.close();
  }, 20_000);

  it("ignores a punch thrown from anywhere but the cave", async () => {
    const nick = await walkIn("Nick", VOLCANO_ROOM_SLUG);
    const watcher = await walkIn("Watcher", CAVE_ROOM_SLUG);
    await until(() => watcher.heard.length > 0);
    nick.punch();
    await pause(300);
    expect(watcher.heard.some((m) => m.punched)).toBe(false);
    for (const p of [nick, watcher]) p.socket.close();
  });
});
