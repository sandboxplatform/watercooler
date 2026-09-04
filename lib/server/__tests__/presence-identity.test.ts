import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import WebSocket from "ws";

/**
 * One person holds one place in a room.
 *
 * A personal code names exactly one person, so a second connection claiming
 * it is that same someone arriving again — most often because the last page's
 * socket outlived the page, which a proxy between browser and server makes
 * routine. Left alone that shows up as meeting yourself at the door of a
 * building you have just walked out of.
 *
 * Driven over a real socket against a real server, because the rule lives in
 * the upgrade and join handlers rather than in the hub, and the thing worth
 * pinning is what a client is actually told.
 */

// Codes have to exist before the access module reads the environment.
process.env.ACCESS_CODE = "test-visitors-share-this-one";
process.env.ACCESS_CODE_COOP = "test-coop-alone";
process.env.ACCESS_CODE_ROB = "test-rob-alone";

const { attachPresenceSocket } = await import("../presence-socket");
const { ACCESS_COOKIE, mintToken } = await import("../access");

const cookieFor = (identity: "visitor" | "coop" | "rob") =>
  `${ACCESS_COOKIE}=${mintToken(identity)}`;

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

interface Connection {
  socket: WebSocket;
  /** Everything the server said, in order, as short labels. */
  heard: string[];
}

/** Open a connection as somebody and walk into a room. */
async function walkIn(
  identity: "visitor" | "coop" | "rob",
  name: string,
  room = "world",
): Promise<Connection> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket`, {
    headers: { cookie: cookieFor(identity), origin: `http://127.0.0.1:${port}` },
  });
  const heard: string[] = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as { type: string; reason?: string };
    if (message.type === "welcome") heard.push("welcome");
    if (message.type === "rejected") heard.push(`rejected:${message.reason}`);
  });
  socket.on("close", () => heard.push("closed"));
  await new Promise<void>((done) =>
    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          type: "join",
          room,
          name,
          spriteKey: "player",
          x: 400,
          y: 400,
          facing: "down",
        }),
      );
      setTimeout(done, 250);
    }),
  );
  return { socket, heard };
}

/**
 * Who is in the room, people only, asked from a connection of its own.
 *
 * As a visitor, deliberately: a census taken as Coop or Rob would displace
 * the very person it was counting, which is how this helper first failed.
 */
function census(room = "world"): Promise<string[]> {
  return new Promise((done) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket`, {
      headers: { cookie: cookieFor("visitor"), origin: `http://127.0.0.1:${port}` },
    });
    socket.on("open", () =>
      socket.send(
        JSON.stringify({
          type: "join",
          room,
          name: "Census",
          spriteKey: "player",
          x: 8,
          y: 8,
          facing: "down",
        }),
      ),
    );
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as {
        type: string;
        players?: { name: string; resident?: boolean }[];
      };
      if (message.type !== "welcome") return;
      const names = (message.players ?? [])
        .filter((player) => player.name !== "Census" && !player.resident)
        .map((player) => player.name)
        .sort();
      socket.close();
      done(names);
    });
  });
}

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

describe("one person, one place", () => {
  it("leaves a single connection alone", async () => {
    const only = await walkIn("coop", "Coop");
    expect(await census()).toEqual(["Coop"]);
    expect(only.heard).toEqual(["welcome"]);
    only.socket.close();
    await settle();
  });

  it("lets the older connection go when the same person arrives again", async () => {
    const first = await walkIn("coop", "Coop");
    const second = await walkIn("coop", "Coop");
    await settle();

    // One Coop in the room, not two — this is the bug this rule exists for.
    expect(await census()).toEqual(["Coop"]);
    expect(first.heard).toContain("rejected:elsewhere");
    expect(first.heard).toContain("closed");
    expect(second.heard).toEqual(["welcome"]);

    second.socket.close();
    await settle();
  });

  /** Told why, so the client stands down instead of taking the place back. */
  it("says which reason it is, rather than closing without a word", async () => {
    const first = await walkIn("rob", "Rob");
    const second = await walkIn("rob", "Rob");
    await settle();
    expect(first.heard[0]).toBe("welcome");
    expect(first.heard[1]).toBe("rejected:elsewhere");
    first.socket.close();
    second.socket.close();
    await settle();
  });

  /**
   * The shared code is many people. Two visitors are two visitors, and the
   * identity says nothing about which of them is which.
   */
  it("never displaces a visitor, who is not one person", async () => {
    const ann = await walkIn("visitor", "Ann");
    const bea = await walkIn("visitor", "Bea");
    await settle();
    expect(await census()).toEqual(["Ann", "Bea"]);
    expect(ann.heard).toEqual(["welcome"]);
    ann.socket.close();
    bea.socket.close();
    await settle();
  });

  it("does not confuse one person with another", async () => {
    const coop = await walkIn("coop", "Coop");
    const rob = await walkIn("rob", "Rob");
    await settle();
    expect(await census()).toEqual(["Coop", "Rob"]);
    expect(coop.heard).toEqual(["welcome"]);
    expect(rob.heard).toEqual(["welcome"]);
    coop.socket.close();
    rob.socket.close();
    await settle();
  });

  /** Rooms are separate places; being in one is no reason to leave another. */
  it("only displaces within the room being joined", async () => {
    const lobby = await walkIn("coop", "Coop", "castle-atlantic");
    const outside = await walkIn("coop", "Coop", "world");
    await settle();
    expect(await census("castle-atlantic")).toEqual(["Coop"]);
    expect(await census("world")).toEqual(["Coop"]);
    expect(lobby.heard).toEqual(["welcome"]);
    lobby.socket.close();
    outside.socket.close();
    await settle();
  });
});
