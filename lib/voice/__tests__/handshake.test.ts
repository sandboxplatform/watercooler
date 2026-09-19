/**
 * The voice handshake: saying hello, and saying it again when it did not take.
 *
 * Everything in here is a bug that made voice chat work about one time in
 * fifty, and every one of them was invisible — no throw, no red pill, just
 * two people unable to hear each other until somebody switched a microphone
 * off and on. They share a shape: a connection is two-sided and every way of
 * losing one is one-sided.
 *
 * Stubbed to the bone, like the file next door. The point is which messages
 * go out and when, not WebRTC.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bus = vi.hoisted(() => ({
  /** Everything the voice chat has listened for on the room socket. */
  handlers: [] as ((message: unknown) => void)[],
  /** Everything it has sent. */
  sent: [] as Record<string, unknown>[],
  /** Who the server says is on the server, and whose microphone is on. */
  people: [] as { id: string; name: string; spriteKey: string; room: string; mic?: boolean }[],
  onlineListeners: [] as (() => void)[],
}));

vi.mock("../../room-socket", () => ({
  onRoomMessage: (handler: (message: unknown) => void) => {
    bus.handlers.push(handler);
    return () => {};
  },
  sendRoom: (message: Record<string, unknown>) => {
    bus.sent.push(message);
    return true;
  },
}));
vi.mock("../../presence-online", () => ({
  onlinePeople: () => bus.people,
  subscribeOnline: (listener: () => void) => {
    bus.onlineListeners.push(listener);
    return () => {};
  },
}));
// "me" sorts below "zz" and above "aa", so the two cases of `offers` are
// reachable by choosing which of them the other person is.
vi.mock("../../presence-self", () => ({ getSelfId: () => "me" }));
vi.mock("../remember", () => ({ rememberVoice: vi.fn(), voiceWasOn: () => false }));

type Desc = { type: string; sdp?: string };

/** Enough RTCPeerConnection to watch the handshake go by. */
class FakePC {
  static made: FakePC[] = [];
  connectionState = "new";
  signalingState = "stable";
  remoteDescription: Desc | null = null;
  localDescription: Desc | null = null;
  onicecandidate: ((event: unknown) => void) | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  closed = false;
  /** How many times a fresh route has been asked for on this connection. */
  restarts = 0;

  constructor() {
    FakePC.made.push(this);
  }
  addTrack() {}
  async createOffer(): Promise<Desc> {
    return { type: "offer", sdp: "OFFER" };
  }
  async createAnswer(): Promise<Desc> {
    return { type: "answer", sdp: "ANSWER" };
  }
  async setLocalDescription(description: Desc) {
    this.localDescription = description;
    this.signalingState = description.type === "offer" ? "have-local-offer" : "stable";
  }
  async setRemoteDescription(description: Desc) {
    this.remoteDescription = description;
    this.signalingState = description.type === "offer" ? "have-remote-offer" : "stable";
  }
  async addIceCandidate() {}
  restartIce() {
    this.restarts += 1;
  }
  close() {
    this.closed = true;
  }

  /** Test seam: the connection reached a state, and said so. */
  settle(state: string) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

function personOnMic(id: string) {
  return { id, name: id, spriteKey: "player", room: "local", mic: true };
}

/** Let every promise the handlers started run to the end. */
async function flush() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}

/** Push a message down the room socket, as the server would. */
async function arrive(message: unknown) {
  for (const handler of [...bus.handlers]) handler(message);
  await flush();
}

const voiceFrom = (id: string, signal: Record<string, unknown>) => ({
  type: "voice",
  from: { id, name: id },
  signal,
});

/** Everything sent as a voice signal, in order. */
const signals = () =>
  bus.sent
    .filter((m) => m.type === "voice")
    .map((m) => ({ to: m.to as string, kind: (m.signal as { kind: string }).kind }));

/** The one local track, so a test can end it the way an OS does. */
let track: { stop: () => void; kind: string; onended: (() => void) | null };
/** Whether the browser will start playback, which it does not always. */
let plays = true;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  bus.handlers.length = 0;
  bus.sent.length = 0;
  bus.people.length = 0;
  bus.onlineListeners.length = 0;
  FakePC.made.length = 0;
  vi.stubGlobal("RTCPeerConnection", FakePC);
  plays = true;
  vi.stubGlobal(
    "Audio",
    class {
      srcObject: unknown = null;
      autoplay = false;
      volume = 1;
      async play() {
        if (!plays) throw new Error("play() failed because the user didn't interact first");
      }
    },
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      resume() {}
      createAnalyser() {
        return { fftSize: 1024, connect() {}, getFloatTimeDomainData() {} };
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
    },
  );
  track = { stop() {}, kind: "audio", onended: null };
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A voice chat listening to the room, with its microphone on. */
async function switchedOn(others: string[] = []) {
  const { voiceChat } = await import("../voice-chat");
  voiceChat.attach();
  for (const id of others) bus.people.push(personOnMic(id));
  await voiceChat.enable();
  await flush();
  return voiceChat;
}

/**
 * The same, with the greeting answered and the line open.
 *
 * Switching on only says hello; the connection is made when the answer comes
 * back, so a test that wants one has to let the other side reply. Only for an
 * id above "me" — that is the half of `offers` where this side is the one
 * that opens the line, and so the half where a `hi` is enough.
 */
async function withPeer(id: string) {
  const voice = await switchedOn([id]);
  await arrive(voiceFrom(id, { kind: "hi" }));
  return voice;
}

describe("saying hello", () => {
  it("answers a hello from somebody already connected to", async () => {
    // "me" < "zz", so this side is the one that offers.
    const voice = await withPeer("zz");
    const first = FakePC.made[0];
    expect(first).toBeDefined();

    // They gave up on us and started again — their connection to us is gone,
    // whatever ours says. Ignoring this is what made one lost handshake last
    // the rest of the session.
    bus.sent.length = 0;
    await arrive(voiceFrom("zz", { kind: "hello" }));

    expect(first.closed).toBe(true);
    expect(signals()).toEqual([
      { to: "zz", kind: "hi" },
      { to: "zz", kind: "offer" },
    ]);
    expect(voice.snapshot().status).toBe("on");
  });

  it("does not answer the answer, so two sides do not greet for ever", async () => {
    await switchedOn(["aa"]);
    // "aa" < "me", so the other side opens the line and this one waits.
    bus.sent.length = 0;
    await arrive(voiceFrom("aa", { kind: "hi" }));

    expect(signals()).toEqual([]);
  });

  it("leaves alone somebody whose microphone is off", async () => {
    await switchedOn();
    bus.people.push({ id: "zz", name: "zz", spriteKey: "player", room: "local" });
    bus.sent.length = 0;
    for (const listener of bus.onlineListeners) listener();
    await flush();

    expect(signals()).toEqual([]);
  });
});

describe("somebody missing from the server's list", () => {
  it("keeps their voice through a blink, which is what a door looks like", async () => {
    const voice = await withPeer("zz");
    FakePC.made[0].settle("connected");
    await flush();
    expect(voice.snapshot().peers).toBe(1);

    // Out of one room and not yet into the next. The server no longer
    // publishes that gap; this is the other half of the same argument,
    // for every gap nobody has thought of yet.
    bus.sent.length = 0;
    bus.people.length = 0;
    for (const listener of bus.onlineListeners) listener();
    await flush();

    expect(FakePC.made[0].closed).toBe(false);
    expect(voice.snapshot().peers).toBe(1);

    // And back, on the very next list: nothing was said and nothing rebuilt.
    bus.people.push(personOnMic("zz"));
    for (const listener of bus.onlineListeners) listener();
    await flush();

    expect(signals()).toEqual([]);
    expect(FakePC.made).toHaveLength(1);
  });

  it("lets them go once they have really gone", async () => {
    const voice = await withPeer("zz");
    FakePC.made[0].settle("connected");
    await flush();

    bus.people.length = 0;
    for (const listener of bus.onlineListeners) listener();
    await flush();
    // Past the grace, with the sweep's own timer to notice it.
    await vi.advanceTimersByTimeAsync(15_000);

    expect(FakePC.made[0].closed).toBe(true);
    expect(voice.snapshot().peers).toBe(0);
  });
});

describe("a handshake that did not take", () => {
  it("is tried again, and the connection rebuilt", async () => {
    await withPeer("zz");
    const first = FakePC.made[0];

    // No route between the two networks. Only this side hears about it, so
    // only this side can do anything about it.
    first.settle("failed");
    await flush();

    bus.sent.length = 0;
    // Past the first backoff: the sweep runs on its own timer.
    await vi.advanceTimersByTimeAsync(13_000);
    await flush();

    // Rebuilt rather than mended, and no new route asked for: this one
    // never connected, so there is nothing to say a fresh set of
    // candidates would have made any difference. The sweep is also what
    // closes it now — a connection that has failed is kept until then, so
    // that a mend has something to work with where a mend is the answer.
    expect(first.restarts).toBe(0);
    expect(first.closed).toBe(true);
    expect(signals().filter((s) => s.kind === "hello")).toEqual([{ to: "zz", kind: "hello" }]);
  });

  it("is left alone while it is still being made", async () => {
    await withPeer("zz");
    FakePC.made[0].settle("connecting");

    bus.sent.length = 0;
    await vi.advanceTimersByTimeAsync(6_000);
    await flush();

    expect(signals()).toEqual([]);
  });

  it("stops being retried once it is connected", async () => {
    await withPeer("zz");
    FakePC.made[0].settle("connected");

    bus.sent.length = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();

    expect(signals()).toEqual([]);
  });

  it("backs off rather than saying hello every few seconds for ever", async () => {
    await switchedOn(["zz"]);
    await flush();
    bus.sent.length = 0;

    // Every attempt fails the moment it is made.
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(20_000);
      await flush();
      const latest = FakePC.made[FakePC.made.length - 1];
      if (latest && !latest.closed) latest.settle("failed");
      await flush();
    }

    // Two minutes at the five-second floor would be two dozen; the cap is a
    // minute, so what is left is a handful.
    const hellos = signals().filter((s) => s.kind === "hello").length;
    expect(hellos).toBeGreaterThan(0);
    expect(hellos).toBeLessThanOrEqual(6);
  });
});

/**
 * Being in Global Chat is a promise that you can speak to the people in it,
 * and everything here is a way of quietly not keeping it. They share a
 * shape with the bugs above: the app went on saying the conversation was
 * fine because nothing in it had asked.
 */
describe("a conversation that stops working", () => {
  it("asks for a new route before it builds another connection", async () => {
    const voice = await withPeer("zz");
    const pc = FakePC.made[0];
    pc.settle("connected");
    await flush();

    // The route went, not the connection: a wifi handover, a NAT that
    // rebound, a relay that dropped the pair.
    bus.sent.length = 0;
    pc.settle("failed");
    await flush();
    expect(pc.closed).toBe(false);

    await vi.advanceTimersByTimeAsync(9_000);

    expect(pc.restarts).toBe(1);
    expect(signals()).toEqual([{ to: "zz", kind: "offer" }]);
    // Mended rather than rebuilt: the same connection throughout.
    expect(FakePC.made).toHaveLength(1);
    expect(voice.snapshot().failed).toBe(1);
  });

  it("starts again from hello when the new route does not help either", async () => {
    await withPeer("zz");
    const pc = FakePC.made[0];
    pc.settle("connected");
    await flush();
    pc.settle("failed");
    await flush();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(pc.restarts).toBe(1);

    // One mend to a connection. A second that fails the same way is a
    // minute of silence spent on the wrong remedy.
    bus.sent.length = 0;
    await vi.advanceTimersByTimeAsync(20_000);

    expect(pc.restarts).toBe(1);
    expect(pc.closed).toBe(true);
    expect(signals()).toContainEqual({ to: "zz", kind: "hello" });
  });

  it("stops reporting somebody as unreachable once they are reached", async () => {
    const voice = await withPeer("zz");
    const pc = FakePC.made[0];
    pc.settle("failed");
    await flush();
    expect(voice.snapshot().failed).toBe(1);

    pc.settle("connected");
    await flush();

    // It used to be a running total, so a pair that failed once and
    // connected on the retry was reported unreachable for the session.
    expect(voice.snapshot().failed).toBe(0);
  });

  it("does not count somebody whose audio the browser will not play", async () => {
    plays = false;
    const voice = await withPeer("zz");
    const pc = FakePC.made[0];
    pc.settle("connected");
    pc.ontrack?.({ streams: [{}] });
    await flush();

    // Connected, and not a sound: the one failure on this side of the
    // connection that looks exactly like success.
    expect(voice.snapshot().peers).toBe(1);
    expect(voice.snapshot().silent).toBe(1);

    // The sweep asks again, and a browser that has since been unblocked says yes.
    plays = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(voice.snapshot().silent).toBe(0);
  });

  it("leaves the chat when the microphone is taken away", async () => {
    const voice = await switchedOn();
    expect(voice.snapshot().status).toBe("on");

    // The OS handing the device to another app, or somebody unplugging it.
    track.onended?.();
    await flush();

    expect(voice.snapshot().status).toBe("denied");
    expect(voice.snapshot().reason).toMatch(/microphone stopped/i);
    // And not remembered, or the next page brings them back on a dead device.
    const { rememberVoice } = await import("../remember");
    expect(rememberVoice).toHaveBeenLastCalledWith(false);
  });
});

describe("the connection itself", () => {
  it("does not wedge when two negotiations cross", async () => {
    await switchedOn(["aa"]);
    // "aa" < "me", so they are the side that offers — and the connection is
    // made here by the offer arriving rather than by anything this side does.
    await arrive(voiceFrom("aa", { kind: "hello" }));
    await arrive(voiceFrom("aa", { kind: "offer", sdp: "THEIRS" }));
    const pc = FakePC.made[FakePC.made.length - 1];
    // A second one crossing the first, which used to throw into a promise
    // nobody held and leave the connection half-described for good.
    await arrive(voiceFrom("aa", { kind: "offer", sdp: "AGAIN" }));

    expect(pc.remoteDescription?.sdp).toBe("AGAIN");
    expect(signals().filter((s) => s.kind === "answer")).toHaveLength(2);
  });
});
