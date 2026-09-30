import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ServerMessage } from "../presence-types";

/**
 * The catch-up read behind a socket store, and the two ways it used to stop.
 *
 * The badges and the baskets each held a flag saying a read had started,
 * and neither ever put it down: a read that failed was never tried again,
 * and one that succeeded was never repeated after the socket dropped and
 * came back, which is exactly when a message or two went past unheard.
 * Both look like a panel that is simply a little out of date.
 */

const socket = vi.hoisted(() => ({
  open: false,
  messages: [] as ((message: ServerMessage) => void)[],
  opens: [] as (() => void)[],
}));

vi.mock("../room-socket", () => ({
  onRoomMessage: (handler: (message: ServerMessage) => void) => {
    socket.messages.push(handler);
    return () => {};
  },
  onRoomOpen: (handler: () => void) => {
    socket.opens.push(handler);
    return () => {};
  },
  isRoomSocketOpen: () => socket.open,
}));

const { createSocketStore } = await import("../socket-store");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function store(load: () => Promise<number[]>) {
  return createSocketStore<number[]>({
    initial: [],
    reduce: (state, message) =>
      message.type === "said" ? [...state, Number(message.text)] : state,
    load: async () => {
      const answer = await load();
      return (heard) => [...answer, ...heard.filter((n) => !answer.includes(n))];
    },
  });
}

beforeEach(() => {
  socket.open = false;
  socket.messages = [];
  socket.opens = [];
});

describe("a socket store's catch-up read", () => {
  it("is asked again by the next subscriber after one that failed", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([1, 2]);
    const s = store(load);
    const off = s.subscribe(() => {});
    await settle();
    expect(s.get()).toEqual([]);
    s.subscribe(() => {});
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(s.get()).toEqual([1, 2]);
    off();
  });

  it("is not asked again once it has an answer", async () => {
    const load = vi.fn().mockResolvedValue([1]);
    const s = store(load);
    s.subscribe(() => {});
    await settle();
    s.subscribe(() => {});
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("is asked again when the socket comes back, and not on its first open", async () => {
    const load = vi.fn().mockResolvedValue([1]);
    const s = store(load);
    s.subscribe(() => {});
    await settle();
    for (const opened of socket.opens) opened(); // the first open
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    for (const opened of socket.opens) opened(); // a reconnect
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps what the socket said while the read was in flight", async () => {
    let answer: (value: number[]) => void = () => {};
    const s = store(() => new Promise((resolve) => (answer = resolve)));
    s.subscribe(() => {});
    for (const heard of socket.messages)
      heard({ type: "said", from: { id: "x", name: "x" }, text: "3" } as ServerMessage);
    answer([1, 2]);
    await settle();
    expect(s.get()).toEqual([1, 2, 3]);
  });
});
