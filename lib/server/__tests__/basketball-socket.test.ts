import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import WebSocket from "ws";
import type { BasketballBroadcast } from "../../presence-types";

/**
 * The ball, over real sockets against a real server.
 *
 * Everything either side of the socket is covered elsewhere — the flight in
 * `lib/world/__tests__`-style purity, who may take it in `basketball.test.ts`
 * — and none of it is the part that goes quiet when it breaks. A message
 * type the socket does not recognise is dropped without a word, a broadcast
 * sent to the wrong room reaches nobody, and a ball published only while it
 * is moving leaves somebody walking onto an empty-looking court. All three
 * look exactly like a ball that is simply not there, which is why this is
 * driven end to end rather than by calling the class.
 *
 * Same shape as `lift-visibility.test.ts` for the same reason.
 */

// Codes have to exist before the access module reads the environment, which
// is why the imports below are awaited rather than written at the top.
process.env.ACCESS_CODE = "test-visitors-share-this-one";

const { attachPresenceSocket } = await import("../presence-socket");
const { ACCESS_COOKIE, mintToken } = await import("../access");
const { CENTRE_SPOT, FEET_BELOW_CENTRE, HOOPS, throwReach } =
  await import("../../world/basketball");
const { WORLD_ROOM_SLUG } = await import("../../rooms");

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

interface Player {
  socket: WebSocket;
  id: string;
  /** Every ball frame this connection has been sent, in order. */
  frames: BasketballBroadcast[];
  /**
   * Stand somewhere, the way a scene does when it puts somebody down.
   *
   * A re-join rather than a `move`, for the reason `place` exists: a join
   * is the scene's word on where somebody is and is not held to walking
   * speed, whereas a move across the park is clamped back to a step. This
   * is about the ball, not about the teleport rule, and a test that has to
   * walk the length of the court in real time is a test nobody runs.
   */
  standAt(at: { x: number; y: number; facing: "left" | "right" }): void;
  take(): void;
  throwIt(power: number): void;
}

/** Feet on a patch of ground: a person's y is the middle of their frame. */
const standingOn = (at: { x: number; y: number }) => ({ x: at.x, y: at.y - FEET_BELOW_CENTRE });

async function walkOut(name: string, room: string): Promise<Player> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket`, {
    headers: { cookie: cookie(), origin: `http://127.0.0.1:${port}` },
  });
  const spot = standingOn(CENTRE_SPOT);
  const player: Player = {
    socket,
    id: "",
    frames: [],
    standAt: (at) =>
      socket.send(JSON.stringify({ type: "join", room, name, spriteKey: "player", ...at })),
    take: () => socket.send(JSON.stringify({ type: "basketball", action: "take" })),
    throwIt: (power) => socket.send(JSON.stringify({ type: "basketball", action: "throw", power })),
  };
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === "welcome") player.id = message.you;
    if (message.type === "basketball") player.frames.push(message as BasketballBroadcast);
  });
  await new Promise<void>((done) =>
    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          type: "join",
          room,
          name,
          spriteKey: "player",
          x: spot.x,
          y: spot.y,
          facing: "right",
        }),
      );
      done();
    }),
  );
  await until(() => player.id !== "");
  return player;
}

/** Wait for something to become true, rather than for a fixed moment. */
async function until(ready: () => boolean, ms = 4000) {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The ball as this connection was last told about it. */
const ballNow = (p: Player) => p.frames[p.frames.length - 1]?.ball;

/**
 * Wait until nobody is holding the ball and it has stopped, and say where.
 *
 * These tests share one server, so the ball is wherever the test before
 * left it — in somebody's hands until their closing socket is swept, and
 * then rolling on for a moment after that. Reading where it actually came
 * to rest, rather than assuming the centre spot, is what keeps them from
 * depending on the order they run in; waiting for it to stop is what keeps
 * the next line from walking to a position the ball has already left.
 */
async function freeBall(p: Player) {
  await until(() => ballNow(p)?.heldBy === null);
  // Generous, because the test before this one may have thrown it the
  // length of the court: a ball at half power is in the air and then
  // rolling for a good few seconds, and a window shorter than that reads
  // as flakiness in whatever test happens to run next.
  const deadline = Date.now() + 10_000;
  let settled = ballNow(p);
  while (Date.now() < deadline) {
    await pause(120);
    const now = ballNow(p);
    if (now && settled && now.x === settled.x && now.y === settled.y && now.heldBy === null) {
      return now;
    }
    settled = now;
  }
  throw new Error("the ball never came to rest");
}

/** Stand over the ball, and give the room a moment to hear about it. */
async function standOver(p: Player, ball: { x: number; y: number }) {
  p.standAt({ ...standingOn(ball), facing: "right" });
  await pause(120);
}

describe("the ball on the world map", () => {
  it("is told to somebody walking out, before anybody has touched it", async () => {
    // A still ball is published once and then not again, which is what keeps
    // an empty court off the wire. Without a frame on the way in, an arrival
    // would see no ball at all until somebody moved it.
    const coop = await walkOut("Coop", WORLD_ROOM_SLUG);
    await until(() => coop.frames.length > 0);
    expect(coop.frames[0].ball).toMatchObject({
      x: CENTRE_SPOT.x,
      y: CENTRE_SPOT.y,
      heldBy: null,
    });
    coop.socket.close();
  });

  it("goes to everybody out there, and to nobody indoors", async () => {
    const coop = await walkOut("Coop", WORLD_ROOM_SLUG);
    const rob = await walkOut("Rob", WORLD_ROOM_SLUG);
    const nick = await walkOut("Nick", "sandbox-erp");
    const ball = await freeBall(coop);
    await standOver(coop, ball);
    const indoorsSoFar = nick.frames.length;

    coop.take();
    await until(() => rob.frames.some((f) => f.ball.heldBy === coop.id));
    expect(rob.frames.some((f) => f.ball.heldBy === coop.id)).toBe(true);
    // A floor of Sandbox ERP has no use for a ball's coordinates.
    expect(nick.frames.length).toBe(indoorsSoFar);

    for (const p of [coop, rob, nick]) p.socket.close();
  }, 20_000);

  it("refuses to be taken from across the court", async () => {
    const coop = await walkOut("Coop", WORLD_ROOM_SLUG);
    const ball = await freeBall(coop);
    await standOver(coop, { x: ball.x + 500, y: ball.y });
    coop.frames.length = 0;
    coop.take();
    await pause(300);
    expect(coop.frames.every((f) => f.ball.heldBy === null)).toBe(true);
    coop.socket.close();
  }, 20_000);

  it("carries a basket back with the thrower's name on it", async () => {
    const coop = await walkOut("Coop", WORLD_ROOM_SLUG);
    const rob = await walkOut("Rob", WORLD_ROOM_SLUG);
    const ball = await freeBall(coop);
    await standOver(coop, ball);

    coop.take();
    await until(() => ballNow(coop)?.heldBy === coop.id);
    expect(ballNow(coop)?.heldBy).toBe(coop.id);

    // Walk to the range this power carries, and let it go. Where they are
    // standing is the server's own record of them rather than anything the
    // throw says, which is the whole reason the throw carries one number.
    const [, east] = HOOPS;
    const power = 0.5;
    await standOver(coop, { x: east.rim.x - throwReach(power), y: east.rim.y });
    coop.throwIt(power);

    // Everybody out there is told, not only whoever threw it.
    await until(() => rob.frames.some((f) => f.scored));
    expect(rob.frames.find((f) => f.scored)?.scored).toEqual({ side: "east", by: "Coop" });

    for (const p of [coop, rob]) p.socket.close();
  }, 30_000);

  it("puts a carried ball down when its carrier's tab closes", async () => {
    // Only the person holding it can let go of it, so a ball in the hands of
    // a closed tab would hang over the court for as long as the server runs.
    const coop = await walkOut("Coop", WORLD_ROOM_SLUG);
    const rob = await walkOut("Rob", WORLD_ROOM_SLUG);
    const ball = await freeBall(coop);
    await standOver(coop, ball);
    coop.take();
    await until(() => ballNow(rob)?.heldBy === coop.id);

    rob.frames.length = 0;
    coop.socket.close();
    await until(() => rob.frames.some((f) => f.ball.heldBy === null));
    expect(rob.frames.some((f) => f.ball.heldBy === null)).toBe(true);
    rob.socket.close();
  }, 20_000);
});
