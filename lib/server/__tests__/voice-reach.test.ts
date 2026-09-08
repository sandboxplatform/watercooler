import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import WebSocket from "ws";

/**
 * Voice reaches the whole server, not one room.
 *
 * Audio goes browser to browser, so the only thing the server does for
 * voice is carry the handshake between two people — and it used to carry it
 * no further than the sender's room. That made voice a room's conversation
 * whatever the client believed: two people a floor apart would say hello to
 * each other and neither would ever hear an answer.
 *
 * Driven over real sockets against a real server, because the rule is in
 * the message handler rather than in anything a unit test can reach, and
 * what is worth pinning is what the other person is actually sent.
 */

// Codes have to exist before the access module reads the environment.
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
  /** The id the server gave this connection, which is how voice is addressed. */
  id: string;
  /** Voice signals that arrived, with who sent them. */
  voice: { from: string; kind: string }[];
}

/** Open a connection as a visitor and walk into a room. */
async function walkIn(name: string, room: string): Promise<Person> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket`, {
    headers: { cookie: cookie(), origin: `http://127.0.0.1:${port}` },
  });
  const person: Person = { socket, id: "", voice: [] };
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as {
      type: string;
      you?: string;
      from?: { name: string };
      signal?: { kind: string };
    };
    if (message.type === "welcome" && message.you) person.id = message.you;
    if (message.type === "voice" && message.from && message.signal) {
      person.voice.push({ from: message.from.name, kind: message.signal.kind });
    }
  });
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
      done();
    }),
  );
  // The id comes back in the welcome, and it is what voice is addressed to.
  await until(() => person.id !== "");
  return person;
}

/**
 * Wait for something to become true, rather than for a fixed moment.
 *
 * A fixed wait is what this had, and it passed on its own and failed
 * alongside the rest of the suite — two servers and their resident
 * simulations on one machine is enough to make 300ms not always enough,
 * which is a flake rather than a finding.
 */
async function until(ready: () => boolean, ms = 4000) {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
}

const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe("the voice handshake", () => {
  it("reaches somebody in another room", async () => {
    const downstairs = await walkIn("Downstairs", "voice-lobby");
    const upstairs = await walkIn("Upstairs", "voice-lobby-floor-1");
    expect(downstairs.id).not.toBe("");
    expect(upstairs.id).not.toBe("");

    downstairs.socket.send(
      JSON.stringify({ type: "voice", to: upstairs.id, signal: { kind: "hello" } }),
    );
    await until(() => upstairs.voice.length > 0);

    expect(upstairs.voice).toEqual([{ from: "Downstairs", kind: "hello" }]);
    downstairs.socket.close();
    upstairs.socket.close();
    await settle();
  });

  it("still reaches somebody in the same room", async () => {
    const one = await walkIn("One", "voice-together");
    const two = await walkIn("Two", "voice-together");

    one.socket.send(JSON.stringify({ type: "voice", to: two.id, signal: { kind: "hello" } }));
    await until(() => two.voice.length > 0);

    expect(two.voice).toEqual([{ from: "One", kind: "hello" }]);
    one.socket.close();
    two.socket.close();
    await settle();
  });

  /** A post box, not a megaphone: it goes to the one person it is addressed to. */
  it("goes to nobody else", async () => {
    const speaker = await walkIn("Speaker", "voice-a");
    const listener = await walkIn("Listener", "voice-b");
    const bystander = await walkIn("Bystander", "voice-a");

    speaker.socket.send(
      JSON.stringify({ type: "voice", to: listener.id, signal: { kind: "hello" } }),
    );
    await until(() => listener.voice.length > 0);
    // Long enough that a signal going where it should not had time to.
    await settle(300);

    expect(listener.voice).toHaveLength(1);
    expect(bystander.voice).toEqual([]);
    speaker.socket.close();
    listener.socket.close();
    bystander.socket.close();
    await settle();
  });

  /** Nothing is delivered to somebody who has gone; the send simply stops. */
  it("drops a signal addressed to nobody", async () => {
    const alone = await walkIn("Alone", "voice-empty");
    alone.socket.send(
      JSON.stringify({ type: "voice", to: "nobody-at-all", signal: { kind: "hello" } }),
    );
    await settle(300);
    expect(alone.socket.readyState).toBe(WebSocket.OPEN);
    expect(alone.voice).toEqual([]);
    alone.socket.close();
    await settle();
  });
});
