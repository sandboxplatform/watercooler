import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import WebSocket from "ws";
import { TILE, TOWN_RIGHT, WOOD_ROWS } from "../../world/tenants";
import { MOVE_BUDGET_WINDOW_MS } from "../../presence-types";
import type { BadgeMessage } from "../../presence-types";

/**
 * The two badges for the parts of the map the world grew into, over a real
 * socket against a real server.
 *
 * Driven here rather than in `badge-rules.test.ts` because the rule is the
 * easy half. Everything that could go wrong is in the wiring: the check
 * runs on every `move` of everybody out of doors, it has to read the
 * position the **hub kept** rather than the one the message carried, and
 * it has to stay off every room that is not the world map. None of those
 * three makes a sound when it breaks — a badge that is never granted and a
 * badge nobody has yet earned look exactly alike.
 *
 * The clamp is the one worth driving over a socket. `hub.move` allows a
 * step of about a sprint and a half per message, so the difference between
 * reading the claim and reading the clamp is the difference between
 * walking to the wood and saying you are in it — and a unit test of
 * `onOutdoors` cannot see that difference at all, because by then the
 * position is already an argument.
 */

// The code has to exist before the access module reads the environment.
process.env.ACCESS_CODE = "test-visitors-share-this-one";

const { attachPresenceSocket } = await import("../presence-socket");
const { ACCESS_COOKIE, mintToken } = await import("../access");
const { WORLD_ROOM_SLUG, floorRoomSlug } = await import("../../rooms");

const cookie = () => `${ACCESS_COOKIE}=${mintToken("visitor")}`;

/** The first row of the town: everything above it is wood. */
const WOOD_FOOT = WOOD_ROWS * TILE;

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

interface Player {
  socket: WebSocket;
  name: string;
  /**
   * Every badge this connection has been told about, in order.
   *
   * Which is not every badge it earned: a badge is announced to the whole
   * server, so this carries everybody's. Narrowing it back to one person
   * is what `codes` below is for.
   */
  badges: BadgeMessage[];
  move(x: number, y: number): void;
  close(): void;
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Somebody walks in, standing where they say they are.
 *
 * A join is placed where it claims, which is how walking out of a door
 * works — so each case below starts somewhere honest and the badge is
 * decided by the moves after it.
 */
async function walkIn(name: string, room: string, x: number, y: number): Promise<Player> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket`, {
    headers: { cookie: cookie(), origin: `http://127.0.0.1:${port}` },
  });
  const player: Player = {
    socket,
    name,
    badges: [],
    move: (mx, my) =>
      socket.send(JSON.stringify({ type: "move", x: mx, y: my, facing: "up", moving: true })),
    close: () => socket.close(),
  };
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === "badge") player.badges.push(message as BadgeMessage);
  });
  await new Promise<void>((open) => socket.once("open", () => open()));
  socket.send(
    JSON.stringify({ type: "join", room, name, spriteKey: "character_09", x, y, facing: "down" }),
  );
  await wait(120);
  return player;
}

/** What this person earned, out of everything they were told about. */
const codes = (player: Player) =>
  player.badges.filter((b) => b.name === player.name).map((b) => b.code);

/** A step the hub will carry, spaced so the next one has a fresh budget. */
async function step(player: Player, x: number, y: number) {
  player.move(x, y);
  await wait(MOVE_BUDGET_WINDOW_MS + 60);
}

describe("the wood and the wilderness, over a socket", () => {
  it("grants Into the Woods to somebody who walks up over the tree line", async () => {
    // Standing on the town's own top row, a stride below the wood.
    const x = TOWN_RIGHT / 2;
    const player = await walkIn("Walker", WORLD_ROOM_SLUG, x, WOOD_FOOT + 40);
    expect(codes(player)).not.toContain("into-the-woods");

    await step(player, x, WOOD_FOOT - 40);

    expect(codes(player)).toContain("into-the-woods");
    // Announced with the room it happened in, so a toast can be narrower
    // than the message — and to nobody as the wilderness, which is the
    // other side of the map.
    const earned = player.badges.find((b) => b.code === "into-the-woods");
    expect(earned?.room).toBe(WORLD_ROOM_SLUG);
    expect(codes(player)).not.toContain("out-in-the-wild");
    player.close();
  });

  it("grants Out in the Wild east of the town, and both up in its corner", async () => {
    const player = await walkIn("Rambler", WORLD_ROOM_SLUG, TOWN_RIGHT - 40, WOOD_FOOT - 40);
    // Up in the wood already, which is one of the two on the first move.
    await step(player, TOWN_RIGHT - 40, WOOD_FOOT - 80);
    expect(codes(player)).toContain("into-the-woods");
    expect(codes(player)).not.toContain("out-in-the-wild");

    // A step east over the town's edge is the wood *and* the wilderness,
    // and the corner must not swallow one of the two.
    await step(player, TOWN_RIGHT + 40, WOOD_FOOT - 80);
    expect(codes(player)).toContain("out-in-the-wild");
    player.close();
  });

  it("does not hand it over to a browser that merely says it is there", async () => {
    // From the middle of the town, one message claiming a spot deep in the
    // wood. `hub.move` clamps the step to about a sprint and a half, so
    // where they end up is a stride from where they were — and reading the
    // claim instead of the clamp is exactly the bug this is here for.
    const x = TOWN_RIGHT / 2;
    const player = await walkIn("Teleporter", WORLD_ROOM_SLUG, x, WOOD_FOOT + 3000);
    await step(player, x, 40);

    expect(codes(player)).not.toContain("into-the-woods");
    player.close();
  });

  it("asks it of the world map and of nowhere else", async () => {
    // An Operations floor has coordinates of its own, and a room's own
    // small numbers land inside the wood's rectangle every time — the wood
    // is a fact about the outdoor map, so the guard is the room and not
    // the geometry.
    const player = await walkIn("Upstairs", floorRoomSlug("sandbox-erp", 3), 400, 300);
    await step(player, 420, 280);

    expect(codes(player)).not.toContain("into-the-woods");
    expect(codes(player)).not.toContain("out-in-the-wild");
    player.close();
  });
});
