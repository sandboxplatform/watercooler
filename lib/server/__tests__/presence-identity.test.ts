import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import WebSocket from "ws";

/**
 * One person, one session.
 *
 * A personal code names exactly one person, so a second connection claiming
 * it is a second window onto somebody already in the world. The one in
 * possession keeps its place and the newcomer is turned away — anywhere on
 * the server, not just in the room being joined, because two Coops is two
 * Coops whether they are in one room or two floors apart.
 *
 * The exception is what makes the rule usable: a page load is a new
 * connection too, and behind a proxy the socket the old page left behind is
 * not closed promptly. So the one in possession is pinged before it is
 * believed, and one that cannot answer stands down for the newcomer.
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
const { CLAIM_GRACE_MS } = await import("../../presence-types");

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

/**
 * Open a connection as somebody and walk into a room.
 *
 * It comes back on the server's answer rather than after a fixed wait. A
 * contested join is decided only after the incumbent has had the grace to
 * answer a ping, so a helper that returned sooner would read a refusal
 * still in flight as silence and every assertion would pass for the wrong
 * reason — and one that always waited the grace would put a second and a
 * half on every join in the file for the sake of the two that need it.
 */
async function walkIn(
  identity: "visitor" | "coop" | "rob",
  name: string,
  room = "world",
  session?: string,
): Promise<Connection> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket`, {
    headers: { cookie: cookieFor(identity), origin: `http://127.0.0.1:${port}` },
  });
  const heard: string[] = [];
  let answered: (() => void) | null = null;
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as { type: string; reason?: string };
    if (message.type === "welcome") heard.push("welcome");
    else if (message.type === "rejected") heard.push(`rejected:${message.reason}`);
    else return;
    answered?.();
  });
  socket.on("close", () => heard.push("closed"));
  await new Promise<void>((done) =>
    socket.on("open", () => {
      const settled = () => {
        clearTimeout(timer);
        answered = null;
        done();
      };
      answered = settled;
      const timer = setTimeout(settled, CLAIM_GRACE_MS + 400);
      socket.send(
        JSON.stringify({
          type: "join",
          room,
          name,
          ...(session ? { session } : {}),
          spriteKey: "player",
          x: 400,
          y: 400,
          facing: "down",
        }),
      );
    }),
  );
  return { socket, heard };
}

/**
 * Who is in the room, people only, asked from a connection of its own.
 *
 * As a visitor, deliberately: a census taken as Coop or Rob would be refused
 * by the very person it was counting, which is how this helper first failed.
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

describe("one person, one session", () => {
  it("leaves a single connection alone", async () => {
    const only = await walkIn("coop", "Coop");
    expect(await census()).toEqual(["Coop"]);
    expect(only.heard).toEqual(["welcome"]);
    only.socket.close();
    await settle();
  });

  it("refuses the second connection and leaves the first where it is", async () => {
    const first = await walkIn("coop", "Coop");
    const second = await walkIn("coop", "Coop");
    await settle();

    // One Coop in the room, and it is the one who was already there.
    expect(await census()).toEqual(["Coop"]);
    expect(first.heard).toEqual(["welcome"]);
    expect(second.heard).toContain("rejected:already-online");
    expect(second.heard).toContain("closed");

    first.socket.close();
    second.socket.close();
    await settle();
  });

  /** Told which refusal it is, so the client stands down instead of retrying. */
  it("says which reason it is, rather than closing without a word", async () => {
    const first = await walkIn("rob", "Rob");
    const second = await walkIn("rob", "Rob");
    await settle();
    expect(second.heard[0]).toBe("rejected:already-online");
    first.socket.close();
    second.socket.close();
    await settle();
  });

  /**
   * The whole point of taking this server-wide. Coop in a lobby and Coop on
   * the floor above is two Coops in the Online list, which is exactly what
   * the rule forbids — and it used to be allowed, because the search only
   * ever looked in the room being joined.
   */
  it("refuses a second connection in another room", async () => {
    const lobby = await walkIn("coop", "Coop", "castle-atlantic");
    const outside = await walkIn("coop", "Coop", "world");
    await settle();

    expect(await census("castle-atlantic")).toEqual(["Coop"]);
    expect(await census("world")).toEqual([]);
    expect(lobby.heard).toEqual(["welcome"]);
    expect(outside.heard).toContain("rejected:already-online");

    lobby.socket.close();
    outside.socket.close();
    await settle();
  });

  /**
   * A reload is a second connection too, and the one it replaces is a socket
   * the far end has stopped answering on. That one does not keep the place:
   * it is pinged, it says nothing, and the newcomer walks in over it.
   *
   * `pause` is what a dead page looks like from here — the socket is open at
   * the server and nothing behind it will ever reply.
   */
  it("lets a newcomer in when the connection in possession has gone quiet", async () => {
    const ghost = await walkIn("coop", "Coop");
    ghost.socket.pause();

    const reloaded = await walkIn("coop", "Coop");
    await settle();

    expect(reloaded.heard).toEqual(["welcome"]);
    expect(await census()).toEqual(["Coop"]);

    ghost.socket.terminate();
    reloaded.socket.close();
    await settle();
  });

  /**
   * The case the ping cannot decide, and the one people actually hit.
   *
   * A reload is a new connection, and the socket the leaving page left
   * behind is often still open at the server — behind a proxy, for whole
   * seconds. Pinging it does not tell you anything, because a pong is
   * written by the browser's network stack rather than by the page's
   * script: a page being torn down answers exactly like a live one. So the
   * incumbent here is left wide awake, which is what made the real bug —
   * walk into a building, get shown the door by your own ghost.
   *
   * The tab says so instead. Same tab, same person, same screen: it takes
   * its own place back and nothing is pinged at all.
   */
  it("lets the same tab take its own place back, without challenging it", async () => {
    const before = await walkIn("coop", "Coop", "world", "tab-one");
    const after = await walkIn("coop", "Coop", "world", "tab-one");
    await settle();

    expect(after.heard).toEqual(["welcome"]);
    expect(await census()).toEqual(["Coop"]);
    // And the one it replaced is told, rather than simply going quiet.
    expect(before.heard).toContain("rejected:already-online");

    before.socket.terminate();
    after.socket.close();
    await settle();
  });

  /** Another tab is another window, and the rule is unchanged for it. */
  it("still refuses a second tab", async () => {
    const first = await walkIn("coop", "Coop", "world", "tab-one");
    const second = await walkIn("coop", "Coop", "world", "tab-two");
    await settle();

    expect(first.heard).toEqual(["welcome"]);
    expect(second.heard).toContain("rejected:already-online");
    expect(await census()).toEqual(["Coop"]);

    first.socket.close();
    second.socket.close();
    await settle();
  });
  /**
   * The shared code is many people. Two visitors are two visitors, and the
   * identity says nothing about which of them is which.
   */
  it("never refuses a visitor, who is not one person", async () => {
    const ann = await walkIn("visitor", "Ann");
    const bea = await walkIn("visitor", "Bea");
    await settle();
    expect(await census()).toEqual(["Ann", "Bea"]);
    expect(ann.heard).toEqual(["welcome"]);
    expect(bea.heard).toEqual(["welcome"]);
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

  /** Walking to the next room, on the connection that already holds the place. */
  it("lets one connection change rooms without refusing itself", async () => {
    const coop = await walkIn("coop", "Coop", "world");
    coop.socket.send(
      JSON.stringify({
        type: "join",
        room: "castle-atlantic",
        name: "Coop",
        spriteKey: "player",
        x: 400,
        y: 400,
        facing: "down",
      }),
    );
    // Its own connection already holds the place, so nothing is contested.
    await settle();

    expect(coop.heard).toEqual(["welcome", "welcome"]);
    expect(await census("castle-atlantic")).toEqual(["Coop"]);
    expect(await census("world")).toEqual([]);

    coop.socket.close();
    await settle();
  });
});
