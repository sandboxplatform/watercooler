import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import WebSocket from "ws";
import type { AccessIdentity } from "../access";

/**
 * The room socket holding its ground: against a join sent twice inside a
 * claim, a Round Table that only a fourth microphone completes, a stroke
 * still being drawn, a board wiped twice, a crowd on the world map, and
 * messages that are not what they say they are.
 *
 * Real sockets against a real server, for the reason the other socket files
 * give: every rule here is in the message handler, and what is worth pinning
 * is what arrives at the other end.
 */

// Codes have to exist before the access module reads the environment.
process.env.ACCESS_CODE = "test-visitors-share-this-one";
process.env.ACCESS_CODE_COOP = "test-coop-hardening";
process.env.ACCESS_CODE_ROB = "test-rob-hardening";
process.env.ACCESS_CODE_ANDREW = "test-andrew-hardening";
process.env.ACCESS_CODE_SARA = "test-sara-hardening";

const { attachPresenceSocket } = await import("../presence-socket");
const { ACCESS_COOKIE, mintToken } = await import("../access");
const { getRoomStore } = await import("../room-store");
const { SHARED_BOARD } = await import("../../whiteboard");
const { WORLD_ROOM_SLUG } = await import("../../rooms");
const { MAX_HUMAN_PLAYERS } = await import("../../presence-types");

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

interface Message {
  type: string;
  [key: string]: unknown;
}

interface Person {
  socket: WebSocket;
  id: string;
  seen: Message[];
  closed: boolean;
  send(message: object): void;
  of(type: string): Message[];
}

async function until(ready: () => boolean, ms = 4000) {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
}

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

/** Open a connection, and join `room` unless told not to. */
async function connect(
  who: AccessIdentity,
  room: string | null,
  {
    name = who as string,
    session,
    query = "",
  }: { name?: string; session?: string; query?: string } = {},
): Promise<Person> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/room/socket${query}`, {
    headers: { cookie: `${ACCESS_COOKIE}=${mintToken(who)}`, origin: `http://127.0.0.1:${port}` },
  });
  const person: Person = {
    socket,
    id: "",
    seen: [],
    closed: false,
    send: (message) => socket.send(JSON.stringify(message)),
    of: (type) => person.seen.filter((m) => m.type === type),
  };
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as Message;
    person.seen.push(message);
    if (message.type === "welcome") person.id = message.you as string;
  });
  socket.on("close", () => (person.closed = true));
  await new Promise<void>((done, fail) => {
    socket.on("open", () => done());
    socket.on("error", fail);
  });
  if (room !== null) {
    person.send({
      type: "join",
      room,
      name,
      session,
      spriteKey: "player",
      x: 400,
      y: 400,
      facing: "down",
    });
    await until(() => person.id !== "" || person.closed);
  }
  return person;
}

const leaveAll = async (...people: Person[]) => {
  for (const person of people) person.socket.terminate();
  await settle();
};

describe("the address", () => {
  it("answers on its path with a query on the end", async () => {
    const one = await connect("visitor", "hardening-query", { query: "?v=2" });
    expect(one.id).not.toBe("");
    await leaveAll(one);
  });
});

describe("a message that is not what it says", () => {
  it("is dropped without taking the connection with it", async () => {
    const one = await connect("visitor", "hardening-garbage");
    one.socket.send("not json at all");
    one.send({ type: "move", x: "far", y: null, facing: 7 });
    one.send({ type: "voice", to: { not: "a string" }, signal: { kind: "offer" } });
    one.send({ type: "pong", to: "nobody", payload: { kind: "state", matchId: "x" } });
    one.send({ type: "join", room: { evil: true }, name: 42, spriteKey: ["x"] });
    await settle();
    expect(one.closed).toBe(false);
    // Still answered: a re-join of a room by a string is a welcome.
    const before = one.of("welcome").length;
    one.send({
      type: "join",
      room: "hardening-garbage",
      name: "One",
      spriteKey: "player",
      x: 1,
      y: 1,
      facing: "up",
    });
    await until(() => one.of("welcome").length > before);
    expect(one.of("welcome").length).toBeGreaterThan(before);
    await leaveAll(one);
  });
});

describe("the open air", () => {
  it("has room for more than a room's worth of people", async () => {
    const crowd: Person[] = [];
    for (let i = 0; i <= MAX_HUMAN_PLAYERS; i++) {
      crowd.push(await connect("visitor", WORLD_ROOM_SLUG, { name: `Walker${i}` }));
    }
    expect(crowd.every((p) => p.id !== "")).toBe(true);
    expect(crowd.flatMap((p) => p.of("rejected"))).toEqual([]);
    await leaveAll(...crowd);
  });

  it("while a room still has its six", async () => {
    const crowd: Person[] = [];
    for (let i = 0; i <= MAX_HUMAN_PLAYERS; i++) {
      crowd.push(await connect("visitor", "hardening-lobby", { name: `Sitter${i}` }));
    }
    const last = crowd[crowd.length - 1];
    await until(() => last.of("rejected").length > 0);
    expect(last.of("rejected")[0]).toMatchObject({ reason: "full" });
    await leaveAll(...crowd);
  });
});

describe("the whiteboard", () => {
  const stroke = (id: string, points: number[]) => ({
    id,
    tool: "pen",
    color: "#000000",
    width: 6,
    points,
  });
  const kept = (id: string) =>
    getRoomStore()
      .listStrokes(SHARED_BOARD)
      .some((s) => (s as { id: string }).id === id);

  it("relays a stroke still being drawn, and keeps only the finished one", async () => {
    const drawer = await connect("visitor", "hardening-board-a");
    const watcher = await connect("visitor", "hardening-board-b");
    drawer.send({
      type: "board",
      action: "draw",
      stroke: stroke("s-draft", [1, 1, 2, 2]),
      done: false,
    });
    await until(() => watcher.of("board").length > 0);
    expect(watcher.of("board")[0]).toMatchObject({ action: "draw", done: false });
    expect(kept("s-draft")).toBe(false);

    drawer.send({
      type: "board",
      action: "draw",
      stroke: stroke("s-draft", [1, 1, 2, 2, 3, 3]),
      done: true,
    });
    await until(() => watcher.of("board").length > 1);
    expect(kept("s-draft")).toBe(true);
    await leaveAll(drawer, watcher);
  });

  it("is wiped once, and a second wipe inside the budget goes nowhere", async () => {
    const wiper = await connect("visitor", "hardening-board-c");
    wiper.send({ type: "board", action: "clear" });
    wiper.send({ type: "board", action: "clear" });
    await settle(300);
    expect(wiper.of("board").filter((m) => m.action === "clear")).toHaveLength(1);
    await leaveAll(wiper);
  });
});

describe("Round Table", () => {
  it("is asked of everybody on the fourth microphone, not only of a first", async () => {
    const sara = await connect("sara", "hardening-mic-1");
    // Sara's own On Mic, spent before anybody else is there.
    sara.send({ type: "mic", on: true });
    await settle(150);
    sara.send({ type: "mic", on: false });
    const others = [
      await connect("coop", "hardening-mic-2"),
      await connect("rob", "hardening-mic-3"),
      await connect("andrew", "hardening-mic-4"),
    ];
    for (const other of others) other.send({ type: "mic", on: true });
    await settle(150);
    // The fourth to switch on is somebody who has been on mic before.
    sara.send({ type: "mic", on: true });
    const tables = () =>
      sara
        .of("badge")
        .filter((m) => m.code === "round-table")
        .map((m) => m.person);
    await until(() => tables().length >= 4);
    expect(new Set(tables())).toEqual(new Set(["sara", "coop", "rob", "andrew"]));
    await leaveAll(sara, ...others);
  });
});

describe("a claim", () => {
  it("takes the claimant's own second join rather than refusing it", async () => {
    const ghost = await connect("coop", "hardening-claim-1", { session: "old-tab" });
    // A page that has gone: open at the socket, answering nothing.
    ghost.socket.pause();
    const newcomer = await connect("coop", null);
    newcomer.send({
      type: "join",
      room: "hardening-claim-1",
      name: "Coop",
      session: "new-tab",
      spriteKey: "player",
      x: 1,
      y: 1,
      facing: "down",
    });
    await settle(100);
    // Inside the claim's grace: the same connection says where it is again.
    newcomer.send({
      type: "join",
      room: "hardening-claim-2",
      name: "Coop",
      session: "new-tab",
      spriteKey: "player",
      x: 1,
      y: 1,
      facing: "down",
    });
    await until(() => newcomer.id !== "" || newcomer.closed, 5000);
    expect(newcomer.of("rejected")).toEqual([]);
    expect(newcomer.closed).toBe(false);
    const coop = () =>
      newcomer
        .of("online")
        .flatMap((m) => m.people as { person: string; room: string }[])
        .filter((p) => p.person === "coop");
    await until(() => coop().some((p) => p.room === "hardening-claim-2"));
    expect(coop().at(-1)?.room).toBe("hardening-claim-2");
    await leaveAll(ghost, newcomer);
  });
});
