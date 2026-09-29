import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import WebSocket from "ws";
import type { EggsBroadcast } from "../../presence-types";
import type { AccessIdentity } from "../../identity";

/**
 * The eggs, over a real socket against a real server.
 *
 * What is driven here is the part that goes quiet when it breaks, which is
 * the same argument `basketball-socket.test.ts` makes: a message type the
 * socket does not recognise is **dropped without a word**, a broadcast sent
 * to the wrong room reaches nobody, and a field published only when it
 * changes leaves somebody walking onto the map seeing nothing at all. All
 * three look exactly like a park with no eggs in it, which is also what a
 * park with no eggs in it looks like.
 *
 * **What is deliberately not driven here is the laying.** An egg comes of
 * Michael being startled, four clucks in a hundred, with a second of quiet
 * between clucks at best and a whole fright's worth of running before it is
 * dropped — so waiting for one is minutes rather than milliseconds,
 * and the chance is the simulation's own randomness. The two halves of it
 * are covered where they can be made to happen on demand: the roll and the
 * spot in `residents.test.ts`, which drives the simulation with a random
 * of its own, and the field in `eggs.test.ts`. What this file needs of an
 * egg is one lying there to be taken, so the field starts with one in it.
 */

// Codes have to exist before the access module reads the environment, which
// is why the imports below are awaited rather than written at the top.
process.env.ACCESS_CODE = "test-visitors-share-this-one";
process.env.ACCESS_CODE_COOP = "test-coop-alone";

/**
 * Where the one egg this file lays by hand is lying, well clear of where
 * everybody else stands — so "nothing at your feet" below is still true.
 */
const { SEEDED } = vi.hoisted(() => ({ SEEDED: { x: 1500, y: 900 } }));

/**
 * A field with one egg already in it, which is the whole of what a take
 * needs and the one thing this file cannot wait for Michael to provide.
 */
vi.mock("../eggs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../eggs")>();
  const { eggSpot } = await import("../../world/eggs");
  class Seeded extends actual.Nest {
    constructor() {
      super();
      this.lay(eggSpot(SEEDED), 0, Date.now());
    }
  }
  return { ...actual, Nest: Seeded };
});

const { attachPresenceSocket } = await import("../presence-socket");
const { ACCESS_COOKIE, mintToken } = await import("../access");
const { WORLD_ROOM_SLUG } = await import("../../rooms");

const cookie = (who: AccessIdentity) => `${ACCESS_COOKIE}=${mintToken(who)}`;

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
  /** Every field frame this connection has been sent, in order. */
  frames: EggsBroadcast[];
  /** Whose baskets this connection has been told an egg went into. */
  found: string[];
  take(): void;
}

async function walkIn(
  name: string,
  room: string,
  who: AccessIdentity = "visitor",
  at = { x: 900, y: 900 },
): Promise<Player> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket`, {
    headers: { cookie: cookie(who), origin: `http://127.0.0.1:${port}` },
  });
  const player: Player = {
    socket,
    id: "",
    frames: [],
    found: [],
    take: () => socket.send(JSON.stringify({ type: "egg", action: "take" })),
  };
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === "welcome") player.id = message.you;
    if (message.type === "eggs") player.frames.push(message as EggsBroadcast);
    if (message.type === "egg-found") player.found.push(message.person);
  });
  await new Promise<void>((done) =>
    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          type: "join",
          room,
          name,
          spriteKey: "player",
          ...at,
          facing: "down",
        }),
      );
      done();
    }),
  );
  await until(() => player.id !== "");
  return player;
}

async function until(ready: () => boolean, ms = 4000) {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the eggs on the world map", () => {
  /**
   * The field is published when it changes, which may have been half an
   * hour ago. Without a frame on the way in, somebody arriving would see
   * an empty park whatever was lying in it — and an empty park is what an
   * empty park looks like, so nothing would ever have reported this.
   */
  it("tells somebody walking out what is lying in the grass", async () => {
    const coop = await walkIn("Coop", WORLD_ROOM_SLUG);
    await until(() => coop.frames.length > 0);
    expect(coop.frames).toHaveLength(1);
    expect(Array.isArray(coop.frames[0].eggs)).toBe(true);
    coop.socket.close();
  });

  /**
   * There is no field indoors and there is not meant to be: a wanderer
   * never goes in, so an egg in a lobby would be one nobody could see.
   * What matters is that a lobby is told nothing rather than told nothing
   * is there — the two are different, and the second would have every
   * floor in the world carrying a message about a park.
   */
  it("says nothing about them to a room with no grass in it", async () => {
    const rob = await walkIn("Rob", "sandbox-erp");
    await pause(300);
    expect(rob.frames).toEqual([]);
    rob.socket.close();
  });

  /** A hand in the grass from a lobby is reaching for something not there. */
  it("ignores a hand in the grass from indoors", async () => {
    const rob = await walkIn("Rob", "sandbox-erp");
    rob.take();
    await pause(300);
    expect(rob.frames).toEqual([]);
    expect(rob.socket.readyState).toBe(WebSocket.OPEN);
    rob.socket.close();
  });

  /**
   * Nothing within reach is the ordinary answer to a stray press of E, and
   * the field must not be published for it — twenty people wandering a
   * park pressing E is otherwise twenty broadcasts a second about nothing
   * having happened.
   */
  it("says nothing when there is nothing at your feet", async () => {
    const coop = await walkIn("Coop", WORLD_ROOM_SLUG);
    await until(() => coop.frames.length > 0);
    const told = coop.frames.length;
    coop.take();
    coop.take();
    await pause(300);
    expect(coop.frames).toHaveLength(told);
    coop.socket.close();
  });

  /**
   * A guest keeps nothing, and an egg is not something a guest can hold
   * for a moment and drop: bending down for one leaves it in the grass for
   * whoever comes along with somewhere to put it. Taking it and then
   * keeping nothing would be the quiet version of this bug — the egg gone
   * from the park and in nobody's basket.
   */
  it("leaves an egg lying for a guest, for somebody who can keep it", async () => {
    const ann = await walkIn("Ann", WORLD_ROOM_SLUG, "visitor", SEEDED);
    await until(() => ann.frames.length > 0);
    const egg = ann.frames[0].eggs[0];
    expect(egg).toBeDefined();
    ann.take();
    await pause(300);
    // Nothing happened, so nothing is published and nobody is told.
    expect(ann.frames).toHaveLength(1);
    expect(ann.found).toEqual([]);

    const coop = await walkIn("Coop", WORLD_ROOM_SLUG, "coop", SEEDED);
    await until(() => coop.frames.length > 0);
    expect(coop.frames[0].eggs.map((e) => e.id)).toContain(egg.id);
    coop.take();
    await until(() => coop.frames.some((f) => f.taken));
    expect(coop.frames.find((f) => f.taken)?.taken?.by).toBe("Coop");
    expect(coop.frames[coop.frames.length - 1].eggs.map((e) => e.id)).not.toContain(egg.id);
    await until(() => ann.found.length > 0);
    expect(ann.found).toEqual(["coop"]);

    for (const p of [ann, coop]) p.socket.close();
  });
});
