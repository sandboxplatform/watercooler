import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import WebSocket from "ws";
import type { MeetingNotice } from "../../presence-types";

/**
 * A meeting called at the boardroom table, and who gets to know.
 *
 * The notice is the whole point of the fixture: the people it is news to
 * are the ones standing somewhere else, so it crosses rooms — and it
 * crosses them only as far as the floor's own door does. Somebody who could
 * not ride the lift to that floor has no business being told what is being
 * held on it, and that is the server's decision rather than the HUD's, for
 * the same reason a private floor's join is.
 *
 * Driven over real sockets against a real server, because all of this lives
 * in the socket's handlers: what a browser is told is the only part of it
 * anything else can observe.
 */

// Codes have to exist before the access module reads the environment, which
// is why the imports below are awaited rather than written at the top.
process.env.ACCESS_CODE = "test-visitors-share-this-one";
process.env.ACCESS_CODE_COOP = "test-coop-alone";
process.env.ACCESS_CODE_ROB = "test-rob-alone";
process.env.ACCESS_CODE_HUNTER = "test-hunter-alone";

const { attachPresenceSocket } = await import("../presence-socket");
const { ACCESS_COOKIE, mintToken } = await import("../access");

type Who = "visitor" | "coop" | "rob" | "hunter";

/** The floor the table is on — and one Hunter has no lift to. */
const BOARDROOM = "sandbox-erp-floor-3";

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

async function until(ready: () => boolean, ms = 4000) {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
}

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

interface Person {
  socket: WebSocket;
  /** The last list of meetings this connection was sent. */
  meetings: MeetingNotice[];
  /** Whether it has been told anything about meetings at all. */
  told: boolean;
  call(on: boolean): void;
}

/** Open a connection as somebody and walk into a room. */
async function walkIn(who: Who, room: string): Promise<Person> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket`, {
    headers: { cookie: `${ACCESS_COOKIE}=${mintToken(who)}`, origin: `http://127.0.0.1:${port}` },
  });
  const person: Person = {
    socket,
    meetings: [],
    told: false,
    call: (on: boolean) => socket.send(JSON.stringify({ type: "meeting", on })),
  };
  let welcomed = false;
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as { type: string; meetings?: MeetingNotice[] };
    if (message.type === "welcome") welcomed = true;
    if (message.type === "meetings") {
      person.meetings = message.meetings ?? [];
      person.told = true;
    }
  });
  await new Promise<void>((done) =>
    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          type: "join",
          room,
          name: who,
          spriteKey: "player",
          x: 400,
          y: 400,
          facing: "down",
        }),
      );
      done();
    }),
  );
  await until(() => welcomed);
  return person;
}

describe("a meeting at the boardroom table", () => {
  it("tells everyone who could walk into that room, wherever they are standing", async () => {
    const coop = await walkIn("coop", BOARDROOM);
    const rob = await walkIn("rob", "world");
    await until(() => rob.told);

    coop.call(true);
    await until(() => rob.meetings.length > 0);

    const [notice] = rob.meetings;
    expect(notice.room).toBe(BOARDROOM);
    expect(notice.host).toBe("coop");
    // In words, because a slug is not a place: this is what the HUD shows.
    expect(notice.where).toBe("Sandbox ERP · Floor 3 · Operations");
    expect(Date.parse(notice.since)).toBeGreaterThan(0);
    // The person who called it is told as well, so the panel can offer to
    // end the one that is running rather than start a second.
    await until(() => coop.meetings.length > 0);
    expect(coop.meetings).toHaveLength(1);

    coop.call(false);
    await until(() => rob.meetings.length === 0);
    expect(rob.meetings).toEqual([]);

    coop.socket.close();
    rob.socket.close();
    await settle();
  });

  /**
   * The floor is private, and a notice is something you know about a place.
   * Hunter rides Castle Atlantic's lift and no other, so what is being held
   * on Sandbox ERP's third floor is not his news — and a visitor, who rides
   * no private lift at all, is in the same position.
   */
  it("says nothing to somebody who could not ride the lift to it", async () => {
    const coop = await walkIn("coop", BOARDROOM);
    const hunter = await walkIn("hunter", "world");
    const guest = await walkIn("visitor", "world");
    await until(() => hunter.told && guest.told);

    coop.call(true);
    await until(() => coop.meetings.length > 0);
    await settle();

    expect(hunter.meetings).toEqual([]);
    expect(guest.meetings).toEqual([]);

    coop.socket.close();
    hunter.socket.close();
    guest.socket.close();
    await settle();
  });

  /**
   * A meeting is held at a table, and the table is on an Operations floor.
   * The panel only opens at one — but `?meeting=1` opens it anywhere, and a
   * panel is decoration either way.
   */
  it("cannot be called in a room with no table in it", async () => {
    const rob = await walkIn("rob", "world");
    await until(() => rob.told);
    rob.call(true);
    await settle();
    expect(rob.meetings).toEqual([]);
    rob.socket.close();
    await settle();
  });

  /**
   * Anybody at the table may end it: the person who called it may well have
   * walked out, and a meeting nobody can end is a notice that hangs over the
   * building.
   */
  it("can be ended by somebody else in the room", async () => {
    const coop = await walkIn("coop", BOARDROOM);
    const rob = await walkIn("rob", BOARDROOM);
    coop.call(true);
    await until(() => rob.meetings.length > 0);

    rob.call(false);
    await until(() => coop.meetings.length === 0);
    expect(coop.meetings).toEqual([]);

    coop.socket.close();
    rob.socket.close();
    await settle();
  });

  /**
   * And when the last of them goes it is over. Nobody is left to press E at
   * the table, and the floor is private — so there may be nobody who can
   * reach it to take the notice down.
   */
  it("ends when the room empties", async () => {
    const coop = await walkIn("coop", BOARDROOM);
    const rob = await walkIn("rob", "world");
    coop.call(true);
    await until(() => rob.meetings.length > 0);

    coop.socket.close();
    await until(() => rob.meetings.length === 0);
    expect(rob.meetings).toEqual([]);

    rob.socket.close();
    await settle();
  });

  /** Somebody walking in late is told what is already under way. */
  it("is told to whoever arrives while it is running", async () => {
    const coop = await walkIn("coop", BOARDROOM);
    coop.call(true);
    await until(() => coop.meetings.length > 0);

    const rob = await walkIn("rob", "world");
    await until(() => rob.meetings.length > 0);
    expect(rob.meetings[0].room).toBe(BOARDROOM);

    coop.socket.close();
    rob.socket.close();
    await settle();
  });
});
