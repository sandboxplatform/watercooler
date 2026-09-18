import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import WebSocket from "ws";
import type { PresencePlayer } from "../../presence-types";
import { BOSS_SPRITE_KEY } from "../../characters/sprites";

/**
 * Nobody walks in wearing somebody else's face.
 *
 * The picker offers each person only what is theirs — the shared cast to a
 * visitor, their own sheet and nothing else to somebody whose own code names
 * one — but the picker is decoration: this socket takes whatever look the
 * browser claims, and a hand-edited profile claims what it likes. So the
 * claim is clamped at the upgrade against the cookie, and this is the only
 * place that shows.
 *
 * Driven over real sockets against a real server, because the rule lives in
 * the upgrade handler rather than in the hub, and the roster is where the
 * answer turns up.
 */

// Codes have to exist before the access module reads the environment, which
// is why the imports below are awaited rather than written at the top.
process.env.ACCESS_CODE = "test-visitors-share-this-one";
process.env.ACCESS_CODE_COOP = "test-coop-alone";
process.env.ACCESS_CODE_CAMPBELL = "test-campbell-alone";

const { attachPresenceSocket } = await import("../presence-socket");
const { ACCESS_COOKIE, mintToken } = await import("../access");

type Who = "visitor" | "coop" | "campbell";

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

/** Wait for something to become true, rather than for a fixed moment. */
async function until(ready: () => boolean, ms = 4000) {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
}

/**
 * Walk in claiming a look, and answer with the one the room gives back.
 *
 * Read off the roster rather than off anything this connection was told
 * directly: what everybody else sees is the whole of the question.
 */
async function looksLike(who: Who, claim: string, room: string): Promise<string> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket`, {
    headers: { cookie: `${ACCESS_COOKIE}=${mintToken(who)}`, origin: `http://127.0.0.1:${port}` },
  });
  let me = "";
  let roster: PresencePlayer[] = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as {
      type: string;
      you?: string;
      players?: PresencePlayer[];
    };
    if (message.type === "welcome" && message.you) me = message.you;
    if (message.players) roster = message.players;
  });
  await new Promise<void>((done) =>
    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          type: "join",
          room,
          name: who,
          spriteKey: claim,
          x: 400,
          y: 400,
          facing: "down",
        }),
      );
      done();
    }),
  );
  await until(() => roster.some((p) => p.id === me));
  const worn = roster.find((p) => p.id === me)?.spriteKey ?? "";
  socket.close();
  return worn;
}

describe("the look a connection claims", () => {
  it("lets a visitor wear the shared cast", async () => {
    expect(await looksLike("visitor", "character_02", "look-a")).toBe("character_02");
  });

  /**
   * The likenesses are of real people and belong to them. A visitor holds a
   * code that was passed around, so the refusal leaves them in what they had
   * — the default, on a first join.
   *
   * The default look, and it has to be a key that names a sheet. It was the
   * word "player", which names none: every scene fell through to the default
   * sheet on its own and so did the People panel, so it read as the right
   * answer everywhere while being the absence of one — and the browser that
   * had been refused went on drawing itself as Coop, alone in the world.
   */
  it("refuses a visitor somebody's likeness", async () => {
    expect(await looksLike("visitor", "character_coop", "look-b")).toBe(BOSS_SPRITE_KEY);
  });

  /**
   * Coop's own code names his sheet, so that sheet is the whole of what he
   * may wear: not Rob's, and not the cast a visitor gets the run of either.
   * And he is put back into his own face rather than into the default, which
   * is the one look a refusal here has a right answer for.
   */
  it("locks somebody whose code names their sheet to it", async () => {
    expect(await looksLike("coop", "character_coop", "look-c")).toBe("character_coop");
    expect(await looksLike("coop", "character_rob", "look-d")).toBe("character_coop");
    expect(await looksLike("coop", "character_02", "look-e")).toBe("character_coop");
  });

  /**
   * The same for the newest likeness on the list, which is the half that
   * rots: a persona used to be exempt from this check outright, and the
   * exemption showed only on somebody nobody thought to test. Campbell is
   * held to his own sheet, and Coop's is as far out of his reach as a
   * stranger's.
   */
  it("holds every persona to their own sheet, not only the first ones", async () => {
    expect(await looksLike("campbell", "character_campbell", "look-f")).toBe("character_campbell");
    expect(await looksLike("campbell", "character_coop", "look-g")).toBe("character_campbell");
    expect(await looksLike("campbell", "character_02", "look-h")).toBe("character_campbell");
  });
});
